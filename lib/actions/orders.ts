'use server';

import { revalidateTag } from 'next/cache';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanProfiles,
  idempotencyKeys,
  orderEvents,
  orders,
  productImages,
  products,
  userAddresses,
} from '@/db/schema';
import { requireUser } from '@/lib/auth-helpers';
import { withIdempotency } from '@/lib/idempotency';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { generateOrderReference } from '@/lib/orders/reference';
import { orderPlaceSchema } from '@/lib/validators/order';

// Reorder stub. The signature stays stable so `ReorderButton` keeps
// compiling against this file; Phase 5 of the order-flow plan replaces
// BOTH the body AND the return type (will become
// `Result<{ productId, productSlug, artisanSlug }>` and route the user
// to the product page with `?reorder=1` for a fresh address selection).
//
// Until then, the button is rendered as `disabled` and this action just
// refuses on the off chance someone routes around the UI.
export async function reorderAction(_input: {
  orderId: string;
}): Promise<Result<{ cartId: string }>> {
  return err('Not yet implemented');
}

/**
 * Place an order for a single product.
 *
 * Why the auth runs OUTSIDE `withIdempotency`: the wrapper caches
 * `Result<T>` returns, not thrown errors. Calling `requireUser` inside
 * the callback would let UnauthorizedError bubble out of the cache
 * window unrecorded. Auth-first keeps the failure shape consistent.
 *
 * Why `placeOrder` needs an advisory lock + cache re-check on top of
 * `withIdempotency`: the wrapper's outer cache check happens BEFORE
 * `fn()` runs and BEFORE any transaction. Two concurrent retries with
 * the same key both pass that check (empty cache), both call `fn()`.
 * For naturally-idempotent actions that's harmless. For placement it
 * isn't — `fn()` decrements stock and inserts a NEW order each call.
 *
 * The fix has TWO parts that must both be present:
 * 1. Advisory lock at the top of the transaction, keyed on
 *    idempotencyKey, serializes concurrent fn() invocations.
 * 2. Cache re-check INSIDE the lock (after the lock is acquired).
 *    The lock guarantees the prior writer has committed; the re-check
 *    sees their cache row and we return the cached result instead of
 *    running the work again.
 *
 * Without the re-check, the lock just delays the second writer — they
 * still create a duplicate order with new stock decrement. Without the
 * lock, the re-check is a TOCTOU race. We need both.
 *
 * Reputation cache invalidation runs AFTER the transaction commits.
 * Inside the callback would invalidate before commit; subsequent reads
 * would re-derive from data that hasn't committed yet. Mirrors the
 * `lib/actions/product.ts:setProductStatusAction` pattern.
 */
export async function placeOrder(
  input: unknown,
): Promise<Result<{ orderId: string; reference: string }>> {
  const log = await getRequestLogger();
  const parsed = orderPlaceSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid order input', parsed.error.flatten().fieldErrors);
  }

  // Auth first — outside withIdempotency so the failure shape is
  // consistent and uncached (re-trying after sign-in shouldn't see a
  // cached "Not authenticated" forever).
  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

  return withIdempotency({
    key: parsed.data.idempotencyKey,
    scope: 'placeOrder',
    userId: buyer.id,
    fn: async () => {
      try {
        // Verify the address belongs to the buyer BEFORE entering the
        // transaction. Saves the cost of acquiring locks for invalid
        // input and gives a clean inline error.
        const [address] = await db
          .select()
          .from(userAddresses)
          .where(
            and(
              eq(userAddresses.id, parsed.data.shippingAddressId),
              eq(userAddresses.userId, buyer.id),
            ),
          )
          .limit(1);

        if (!address) {
          return err('Shipping address not found or not yours');
        }

        // The transaction returns either a `cached` shape (when a prior
        // writer with the same idempotencyKey already finished) or a
        // `fresh` shape (when this caller did the work). The post-commit
        // revalidateTag should NOT fire in the cached path — the prior
        // writer already invalidated. Discriminator preserves that.
        type TxResult =
          | {
              kind: 'cached';
              cached: Result<{ orderId: string; reference: string }>;
            }
          | { kind: 'fresh'; orderId: string; reference: string; artisanProfileId: string };

        const result: TxResult = await db.transaction(async (tx) => {
          // 0. Advisory lock keyed on idempotencyKey + cache re-check.
          //    The advisory lock alone serializes concurrent retries but
          //    does NOT prevent duplicate work — the second arriver,
          //    after acquiring the lock, would still go through FOR
          //    UPDATE → decrement → insert. The re-check inside the lock
          //    catches the prior writer's committed cache row and short-
          //    circuits to return the same Result they returned. Lock is
          //    transaction-scoped (auto-released on commit/rollback);
          //    32-bit hash collisions on different keys are harmless
          //    (extra serialization, no correctness impact).
          if (parsed.data.idempotencyKey) {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.idempotencyKey}))`,
            );
            const [cached] = await tx
              .select()
              .from(idempotencyKeys)
              .where(eq(idempotencyKeys.key, parsed.data.idempotencyKey))
              .limit(1);
            if (cached) {
              // Honor the wrapper's scope/user guards even on the
              // cache-hit-inside-lock path.
              if (cached.scope !== 'placeOrder') {
                return {
                  kind: 'cached' as const,
                  cached: err('Idempotency key already used for a different operation.'),
                };
              }
              if (cached.userId && cached.userId !== buyer.id) {
                return {
                  kind: 'cached' as const,
                  cached: err('Idempotency key already used by a different user.'),
                };
              }
              return {
                kind: 'cached' as const,
                cached: JSON.parse(cached.responseJson) as Result<{
                  orderId: string;
                  reference: string;
                }>,
              };
            }
          }

          // 1. Lock the product row, verify availability.
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, parsed.data.productId))
            .for('update')
            .limit(1);

          if (!product) throw new Error('Product not found');
          if (product.status !== 'published') throw new Error('Product is not available');
          if (product.stockOnHand <= 0) throw new Error('Product is out of stock');

          const [artisan] = await tx
            .select()
            .from(artisanProfiles)
            .where(eq(artisanProfiles.id, product.artisanProfileId))
            .limit(1);

          if (!artisan) throw new Error('Artisan profile missing');

          // TODO when seller-suspension feature lands: also reject placement
          // when the artisan is suspended/closed. Out of scope here.

          if (artisan.userId === buyer.id) {
            throw new Error('You cannot order your own product');
          }

          // 2. Decrement stock; flip status to sold_out at zero so the
          //    storefront and "more from this artisan" lists hide it.
          const newStock = product.stockOnHand - 1;
          await tx
            .update(products)
            .set({
              stockOnHand: newStock,
              status: newStock === 0 ? 'sold_out' : product.status,
              updatedAt: new Date(),
            })
            .where(eq(products.id, product.id));

          // 3. Snapshot the primary image (lowest position). Read without
          //    locking — order history is allowed to reference deleted
          //    media; the snapshot is "what the buyer saw at order time."
          const [primaryImage] = await tx
            .select({ url: productImages.url })
            .from(productImages)
            .where(eq(productImages.productId, product.id))
            .orderBy(asc(productImages.position))
            .limit(1);

          // 4. Insert the order with all snapshot fields.
          const reference = generateOrderReference();
          const [order] = await tx
            .insert(orders)
            .values({
              buyerUserId: buyer.id,
              artisanProfileId: artisan.id,
              reference,
              productId: product.id,
              productTitleSnapshot: product.title,
              productSlugSnapshot: product.slug,
              productImageUrlSnapshot: primaryImage?.url ?? null,
              artisanNameSnapshot: artisan.shopName,
              artisanSlugSnapshot: artisan.shopSlug,
              priceSnapshot: product.price,
              currency: product.currency,
              shippingAddressJson: {
                recipientName: address.recipientName,
                phone: address.phone,
                line1: address.line1,
                line2: address.line2,
                barangay: address.barangay,
                city: address.city,
                province: address.province,
                postalCode: address.postalCode,
                countryCode: address.countryCode,
              },
              notesFromBuyer: parsed.data.notesFromBuyer ?? null,
            })
            .returning();

          if (!order) throw new Error('Failed to create order');

          // 5. Audit event. metadataJson shape per the Phase 1 contract
          //    (db/schema/app.ts) — `placed` events carry the price
          //    snapshot for analytics.
          await tx.insert(orderEvents).values({
            orderId: order.id,
            type: 'placed',
            actorUserId: buyer.id,
            actorRole: 'buyer',
            metadataJson: {
              priceSnapshot: product.price,
              currency: product.currency,
            },
          });

          return {
            kind: 'fresh' as const,
            orderId: order.id,
            reference,
            artisanProfileId: artisan.id,
          };
        });

        if (result.kind === 'cached') {
          // The prior writer for this idempotencyKey already invalidated
          // the reputation cache; don't double-fire. Return their Result
          // verbatim so retries see identical responses.
          log.info(
            { idempotencyKey: parsed.data.idempotencyKey, productId: parsed.data.productId },
            'placeOrder cache-hit-inside-lock — returning prior result',
          );
          return result.cached;
        }

        log.info({ orderId: result.orderId, productId: parsed.data.productId }, 'Order placed');

        // Reputation cache invalidation: placement changes the
        // denominators of every reputation metric (response rate,
        // fulfillment rate, dispute rate). Per-artisan tag avoids
        // invalidating every other seller's cache on every order.
        revalidateTag(`reputation:${result.artisanProfileId}`, 'max');

        return ok({ orderId: result.orderId, reference: result.reference });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not place order';
        log.error({ err: e, productId: parsed.data.productId }, 'placeOrder failed');
        return err(message);
      }
    },
  });
}
