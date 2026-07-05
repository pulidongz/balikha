'use server';

import { randomUUID } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanProfiles,
  notifications,
  orderDisputes,
  orderEvents,
  orders,
  productImages,
  products,
  userAddresses,
} from '@/db/schema';
import {
  ADMIN_REQUIRED_MESSAGE,
  assertVerifiedEmail,
  getCurrentUser,
  NOT_AUTHENTICATED_MESSAGE,
  tryRequireAdmin,
  tryRequireArtisan,
  tryRequireUser,
} from '@/lib/auth-helpers';
import { recordAdminAction } from '@/lib/admin/audit';
import { withIdempotency, withInTxIdempotency } from '@/lib/idempotency';
import { logAnalyticsEvent, logArtisanMilestoneOnce } from '@/lib/analytics/log';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { dispatchOrderEmail, type OrderEmailDispatch } from '@/lib/email/notifications';
import { pivotPrePurchaseThreadToOrder } from '@/lib/messaging/pivot';
import { generateOrderReference } from '@/lib/orders/reference';
import { returnStockIfPreShipment } from '@/lib/orders/stock';
import { transitionOrder } from '@/lib/orders/transition';
import type { OrderStatus } from '@/lib/orders/types';
import {
  adminForceActionInputSchema,
  disputeResolveInputSchema,
  disputeRespondInputSchema,
  fileDisputeInputSchema,
  orderCancelInputSchema,
  orderPlaceSchema,
  orderTransitionInputSchema,
} from '@/lib/validators/order';

/**
 * Expected, user-facing rejection thrown inside `placeOrder`'s
 * transaction (out of stock, product gone, address not yours). These
 * are deterministic outcomes a retry should see again, so
 * `withIdempotency` is allowed to cache them. Unexpected failures (DB
 * errors, bugs) stay plain `Error`s — they re-throw uncached so a
 * transient failure is not permanently pinned to the idempotency key.
 */
class OrderBusinessError extends Error {}

/**
 * Reorder: from a past order, send the buyer back to the product page
 * with a pre-opened order modal so they can place a new order against
 * a fresh address. Returns LIVE slugs (looked up via productId), not
 * the order's snapshot slugs — the product or artisan may have been
 * renamed since the original order and the snapshots would 404.
 *
 * Fails cleanly when:
 *   - the order doesn't belong to the buyer
 *   - the product was deleted (productId is null after ON DELETE SET NULL)
 *   - the product exists but the artisan profile was removed
 *
 * The button's UX path: `success → router.push('/studio/[artisan]/[product]?reorder=1')`
 * → OrderButton on that page detects ?reorder=1 and auto-opens the
 * dialog with a fresh address selection.
 */
export async function reorderAction(input: {
  orderId: string;
}): Promise<Result<{ productId: string; productSlug: string; artisanSlug: string }>> {
  const buyer = await tryRequireUser();
  if (!buyer) return err(NOT_AUTHENTICATED_MESSAGE);

  const [order] = await db
    .select({
      id: orders.id,
      productId: orders.productId,
    })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerUserId, buyer.id)))
    .limit(1);
  if (!order) return err('Order not found');

  if (!order.productId) {
    return err('That piece is no longer available.');
  }

  const [row] = await db
    .select({
      productSlug: products.slug,
      artisanSlug: artisanProfiles.shopSlug,
      salesMode: products.salesMode,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.id, order.productId))
    .limit(1);
  if (!row) return err('That piece is no longer available.');

  // T3: the live product may have moved out of for_sale since the original
  // order. ?reorder=1 would land on a page with no order dialog — tell the
  // buyer up front instead.
  if (row.salesMode !== 'for_sale') {
    return err('That piece is no longer for sale.');
  }

  return ok({
    productId: order.productId,
    productSlug: row.productSlug,
    artisanSlug: row.artisanSlug,
  });
}

/**
 * Place an order for a single product.
 *
 * Why the auth runs OUTSIDE `withIdempotency`: the wrapper caches
 * `Result<T>` returns, not thrown errors. Running auth inside the
 * callback would let an infra failure mid-session-lookup (which
 * tryRequireUser rethrows) bubble out of the cache window unrecorded.
 * Auth-first keeps the failure shape consistent.
 *
 * Why `placeOrder` needs an advisory lock + cache re-check on top of
 * `withIdempotency`: the wrapper's outer cache check happens BEFORE
 * `fn()` runs and BEFORE any transaction. Two concurrent retries with
 * the same key both pass that check (empty cache), both call `fn()`.
 * For naturally-idempotent actions that's harmless. For placement it
 * isn't — `fn()` decrements stock and inserts a NEW order each call.
 *
 * The fix has THREE parts that must all be present — all provided by the
 * shared `withInTxIdempotency` helper the transaction below delegates to:
 * 1. Advisory lock at the top of the transaction, keyed on
 *    idempotencyKey, serializes concurrent fn() invocations.
 * 2. The idempotency cache row is written INSIDE this transaction, so it
 *    commits while the advisory lock is still held. withIdempotency's own
 *    post-fn() insert lands AFTER the lock releases — too late for a
 *    concurrent retry's re-check to observe.
 * 3. Cache re-check INSIDE the lock (after the lock is acquired).
 *    Thanks to (2) the lock guarantees a prior writer's cache row is
 *    already committed; the re-check sees it and returns the cached
 *    result instead of running the work again.
 *
 * Without (2) the re-check races withIdempotency's late insert and the
 * second writer still creates a duplicate order. Without the lock the
 * re-check is a TOCTOU race. We need all three.
 *
 * Reputation cache invalidation runs AFTER the transaction commits.
 * Inside the callback would invalidate before commit; subsequent reads
 * would re-derive from data that hasn't committed yet. Mirrors the
 * `lib/actions/product.ts:setProductStatusAction` pattern.
 */
export async function placeOrder(
  input: unknown,
): Promise<Result<{ orderId: string; reference: string; threadLinkSkipped: boolean }>> {
  const log = await getRequestLogger();
  const parsed = orderPlaceSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid order input', parsed.error.flatten().fieldErrors);
  }

  // Auth first — outside withIdempotency so the failure shape is
  // consistent and uncached (re-trying after sign-in shouldn't see a
  // cached "Not authenticated" forever).
  const buyer = await tryRequireUser();
  if (!buyer) return err(NOT_AUTHENTICATED_MESSAGE);

  const verified = assertVerifiedEmail(buyer);
  if (!verified.ok) return err(verified.error);

  return withIdempotency({
    key: parsed.data.idempotencyKey,
    scope: 'placeOrder',
    userId: buyer.id,
    fn: async () => {
      try {
        // The in-tx advisory-lock + cache re-check + cache insert is the
        // shared withInTxIdempotency helper. It returns a `cached` outcome
        // (a prior same-key writer already finished — post-commit side
        // effects must NOT re-fire) or a `fresh` outcome carrying `extra`,
        // the post-commit-only data the side effects below read.
        const outcome = await db.transaction((tx) =>
          withInTxIdempotency<
            { orderId: string; reference: string; threadLinkSkipped: boolean },
            {
              orderId: string;
              reference: string;
              threadLinkSkipped: boolean;
              artisanProfileId: string;
              sellerUserId: string;
              productTitle: string;
              productImageUrl: string | null;
            }
          >(tx, {
            key: parsed.data.idempotencyKey,
            scope: 'placeOrder',
            userId: buyer.id,
            run: async () => {
              // Verify the shipping address still belongs to the buyer.
              // Done INSIDE the transaction (and FOR UPDATE-locked) so the
              // row validated here is exactly the one snapshotted onto the
              // order below — a concurrent address edit or delete cannot
              // slip between the ownership check and the snapshot.
              const [address] = await tx
                .select()
                .from(userAddresses)
                .where(
                  and(
                    eq(userAddresses.id, parsed.data.shippingAddressId),
                    eq(userAddresses.userId, buyer.id),
                  ),
                )
                .for('update')
                .limit(1);
              if (!address) {
                throw new OrderBusinessError('Shipping address not found or not yours');
              }

              // 1. Lock the product row, verify availability.
              const [product] = await tx
                .select()
                .from(products)
                .where(eq(products.id, parsed.data.productId))
                .for('update')
                .limit(1);

              if (!product) throw new OrderBusinessError('Product not found');
              if (product.status !== 'published') {
                throw new OrderBusinessError('Product is not available');
              }
              // T3: showcase / commission works carry no commerce. The detail
              // page hides the order UI for them; this is the server-side gate.
              if (product.salesMode !== 'for_sale') {
                throw new OrderBusinessError('This work is not for sale');
              }
              if (product.price === null) {
                // The products_for_sale_has_price CHECK makes this unreachable.
                // If it ever fires the data is corrupt — fail loud, never
                // snapshot a null price onto an order.
                throw new Error(`for_sale product ${product.id} has no price`);
              }
              if (product.stockOnHand <= 0) {
                throw new OrderBusinessError('Product is out of stock');
              }

              const [artisan] = await tx
                .select()
                .from(artisanProfiles)
                .where(eq(artisanProfiles.id, product.artisanProfileId))
                .limit(1);

              if (!artisan) throw new Error('Artisan profile missing');

              // TODO when seller-suspension feature lands: also reject placement
              // when the artisan is suspended/closed. Out of scope here.

              if (artisan.userId === buyer.id) {
                throw new OrderBusinessError('You cannot order your own product');
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

              // 6. Notify the seller a new order is waiting for their
              //    response. Placement is not a status transition, so it
              //    never reaches transitionOrder's fan-out — the new-order
              //    notification is created here, inside the same transaction
              //    as the order + audit event. A notification-insert failure
              //    rolls the placement back, matching the atomicity stance
              //    documented on fanOutTransitionNotification.
              await tx.insert(notifications).values({
                userId: artisan.userId,
                type: 'order_status_changed',
                title: 'New order to review',
                body: `Order ${reference}`,
                target: {
                  kind: 'order',
                  id: order.id,
                  url: `/dashboard/orders/${order.id}`,
                },
              });

              // 6.5. Pre-purchase thread pivot (optional, BEST-EFFORT).
              //      When the placement was initiated from inside an
              //      existing thread, link them: thread.orderId becomes
              //      set, thread.updatedAt bumps so the inbox surfaces the
              //      converted thread. The messaging-domain UPDATE
              //      (active-pre-purchase invariant + IDOR-safe WHERE) lives
              //      in lib/messaging/pivot.ts alongside the other
              //      messaging-tx helpers.
              //
              //      Non-fatal by design: if the pivot matches 0 rows
              //      (stale CTA, thread already converted, wrong product),
              //      the order STILL commits — the order is the buyer's
              //      actual goal, the thread link is a secondary nicety.
              //      Throwing here would roll back the placement AND let
              //      withIdempotency cache that failure, permanently
              //      bricking the key for an order that could otherwise be
              //      placed. Instead we log it and surface a non-blocking
              //      `threadLinkSkipped` flag on the success result. A
              //      SUCCESSFUL pivot stays atomic with the order insert
              //      (same transaction).
              let threadLinkSkipped = false;
              if (parsed.data.threadId) {
                const { linked } = await pivotPrePurchaseThreadToOrder(tx, {
                  threadId: parsed.data.threadId,
                  buyerUserId: buyer.id,
                  productId: product.id,
                  orderId: order.id,
                });
                if (!linked) {
                  threadLinkSkipped = true;
                  log.warn(
                    {
                      threadId: parsed.data.threadId,
                      orderId: order.id,
                      buyerUserId: buyer.id,
                    },
                    'placeOrder: thread pivot matched 0 rows — order placed, thread not linked',
                  );
                }
              }

              return {
                result: ok({ orderId: order.id, reference, threadLinkSkipped }),
                extra: {
                  orderId: order.id,
                  reference,
                  threadLinkSkipped,
                  artisanProfileId: artisan.id,
                  sellerUserId: artisan.userId,
                  productTitle: order.productTitleSnapshot,
                  productImageUrl: order.productImageUrlSnapshot,
                },
              };
            },
          }),
        );

        if (outcome.kind === 'cached') {
          // The prior writer for this idempotencyKey already invalidated
          // the reputation cache; don't double-fire. Return their Result
          // verbatim so retries see identical responses.
          log.info(
            { idempotencyKey: parsed.data.idempotencyKey, productId: parsed.data.productId },
            'placeOrder cache-hit-inside-lock — returning prior result',
          );
          return outcome.result;
        }

        const { extra } = outcome;
        log.info({ orderId: extra.orderId, productId: parsed.data.productId }, 'Order placed');

        // Reputation cache invalidation: placement changes the
        // denominators of every reputation metric (response rate,
        // fulfillment rate, dispute rate). Per-artisan tag avoids
        // invalidating every other seller's cache on every order.
        revalidateTag(`reputation:${extra.artisanProfileId}`, 'max');

        await logAnalyticsEvent({
          type: 'order_placed',
          userId: buyer.id,
          artisanProfileId: extra.artisanProfileId,
          entityType: 'order',
          entityId: extra.orderId,
          metadata: { reference: extra.reference },
        });
        // Seller-funnel lifetime milestone — the helper checks the log and
        // no-ops if this artisan has ever received an order before.
        await logArtisanMilestoneOnce({
          type: 'first_order',
          artisanProfileId: extra.artisanProfileId,
          userId: buyer.id,
          entityType: 'order',
          entityId: extra.orderId,
        });

        const sellerEmail: OrderEmailDispatch = {
          recipientUserId: extra.sellerUserId,
          kind: 'new_order',
          orderReference: extra.reference,
          productTitle: extra.productTitle,
          url: `/dashboard/orders/${extra.orderId}`,
          imagePath: extra.productImageUrl,
        };
        after(() => dispatchOrderEmail(sellerEmail));

        return outcome.result;
      } catch (e) {
        if (e instanceof OrderBusinessError) {
          // Deterministic, user-facing rejection — safe to surface to
          // the buyer and safe for withIdempotency to cache.
          return err(e.message);
        }
        // Unexpected failure (DB error, bug). Re-throw so it is NOT
        // cached against the idempotency key — a later retry runs
        // fresh instead of seeing a permanently pinned failure.
        log.error({ err: e, productId: parsed.data.productId }, 'placeOrder failed');
        throw e;
      }
    },
  });
}

// =============================================================================
// Status transitions
// =============================================================================

// -----------------------------------------------------------------------------
// Seller actions
// -----------------------------------------------------------------------------

export async function acceptOrder(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await tryRequireArtisan();
  if (!seller) return err('Artisan profile required');

  // Email verification can lapse after an email change; gate seller commerce
  // progression on the current state (declineOrder/cancelAsSeller stay ungated
  // so a seller can always release a buyer's order). getCurrentUser is cached.
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['pending_seller_response'],
    toStatus: 'pending_payment_arrangement',
    actorUserId: seller.userId,
    actorRole: 'seller',
    authorizationCheck: (o) => o.artisanProfileId === seller.id,
    eventType: 'accepted',
    notes: parsed.data.notes,
    fieldUpdates: { acceptedAt: new Date() },
  });
}

export async function declineOrder(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderCancelInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await tryRequireArtisan();
  if (!seller) return err('Artisan profile required');

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['pending_seller_response'],
    toStatus: 'cancelled_by_seller',
    actorUserId: seller.userId,
    actorRole: 'seller',
    authorizationCheck: (o) => o.artisanProfileId === seller.id,
    eventType: 'declined',
    notes: parsed.data.notes,
    metadataJson: { reason: parsed.data.reason, notes: parsed.data.notes },
    fieldUpdates: {
      declinedAt: new Date(),
      cancelledAt: new Date(),
      cancellationReason: parsed.data.reason,
      cancellationNotes: parsed.data.notes ?? null,
    },
    onTransition: returnStockIfPreShipment,
  });
}

export async function markPaymentReceived(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await tryRequireArtisan();
  if (!seller) return err('Artisan profile required');

  // Email verification can lapse after an email change; gate seller commerce
  // progression on the current state (declineOrder/cancelAsSeller stay ungated
  // so a seller can always release a buyer's order). getCurrentUser is cached.
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['pending_payment_arrangement'],
    toStatus: 'payment_received',
    actorUserId: seller.userId,
    actorRole: 'seller',
    authorizationCheck: (o) => o.artisanProfileId === seller.id,
    eventType: 'payment_received',
    notes: parsed.data.notes,
    fieldUpdates: { paymentReceivedAt: new Date() },
  });
}

export async function markShipped(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await tryRequireArtisan();
  if (!seller) return err('Artisan profile required');

  // Email verification can lapse after an email change; gate seller commerce
  // progression on the current state (declineOrder/cancelAsSeller stay ungated
  // so a seller can always release a buyer's order). getCurrentUser is cached.
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['payment_received'],
    toStatus: 'shipped',
    actorUserId: seller.userId,
    actorRole: 'seller',
    authorizationCheck: (o) => o.artisanProfileId === seller.id,
    eventType: 'shipped',
    notes: parsed.data.notes,
    fieldUpdates: { shippedAt: new Date() },
  });
}

export async function cancelAsSeller(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderCancelInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await tryRequireArtisan();
  if (!seller) return err('Artisan profile required');

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['pending_payment_arrangement', 'payment_received'],
    toStatus: 'cancelled_by_seller',
    actorUserId: seller.userId,
    actorRole: 'seller',
    authorizationCheck: (o) => o.artisanProfileId === seller.id,
    eventType: 'cancelled_by_seller',
    notes: parsed.data.notes,
    metadataJson: { reason: parsed.data.reason, notes: parsed.data.notes },
    fieldUpdates: {
      cancelledAt: new Date(),
      cancellationReason: parsed.data.reason,
      cancellationNotes: parsed.data.notes ?? null,
    },
    onTransition: returnStockIfPreShipment,
  });
}

// -----------------------------------------------------------------------------
// Buyer actions
// -----------------------------------------------------------------------------

export async function cancelAsBuyer(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderCancelInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const buyer = await tryRequireUser();
  if (!buyer) return err(NOT_AUTHENTICATED_MESSAGE);

  const verified = assertVerifiedEmail(buyer);
  if (!verified.ok) return err(verified.error);

  return transitionOrder({
    orderId: parsed.data.orderId,
    // Buyer can self-cancel up to payment_received (per the transition
    // matrix). After payment_received the seller may already be packing
    // — buyer cancellation at that point requires a dispute, not a
    // unilateral cancel.
    expectedFrom: ['pending_seller_response', 'pending_payment_arrangement'],
    toStatus: 'cancelled_by_buyer',
    actorUserId: buyer.id,
    actorRole: 'buyer',
    authorizationCheck: (o) => o.buyerUserId === buyer.id,
    eventType: 'cancelled_by_buyer',
    notes: parsed.data.notes,
    metadataJson: { reason: parsed.data.reason, notes: parsed.data.notes },
    fieldUpdates: {
      cancelledAt: new Date(),
      cancellationReason: parsed.data.reason,
      cancellationNotes: parsed.data.notes ?? null,
    },
    onTransition: returnStockIfPreShipment,
  });
}

export async function markReceived(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const buyer = await tryRequireUser();
  if (!buyer) return err(NOT_AUTHENTICATED_MESSAGE);

  const verified = assertVerifiedEmail(buyer);
  if (!verified.ok) return err(verified.error);

  return transitionOrder({
    orderId: parsed.data.orderId,
    expectedFrom: ['shipped'],
    toStatus: 'completed',
    actorUserId: buyer.id,
    actorRole: 'buyer',
    authorizationCheck: (o) => o.buyerUserId === buyer.id,
    eventType: 'completed',
    notes: parsed.data.notes,
    fieldUpdates: { completedAt: new Date() },
  });
}

// -----------------------------------------------------------------------------
// Dispute filing + response
// -----------------------------------------------------------------------------

/**
 * File a dispute on an order. Per Issue 2 of the round-2 plan review,
 * this routes the status flip through `transitionOrder` rather than
 * doing a parallel `db.update(orders).set({ status: 'disputed' })` —
 * the order_events audit row, the Phase 4.5 counterparty notification,
 * and the per-artisan reputation cache invalidation all happen for
 * free inside the helper. The dispute-row insert lives in
 * `onTransition` so it commits atomically with the status change.
 *
 * The partial unique index `order_disputes_active_per_order` from
 * Phase 1 is the durable race-protection — if a concurrent caller is
 * also trying to file, only one INSERT survives and we translate the
 * constraint violation into a clean error message.
 */
export async function fileDispute(input: unknown): Promise<Result<{ disputeId: string }>> {
  const parsed = fileDisputeInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid dispute input', parsed.error.flatten().fieldErrors);

  const filer = await tryRequireUser();
  if (!filer) return err(NOT_AUTHENTICATED_MESSAGE);

  // Determine which side the filer is on. The dispute-row's
  // `filedByRole` and the transition's `actorRole` need to match.
  const [order] = await db
    .select({
      id: orders.id,
      buyerUserId: orders.buyerUserId,
      artisanProfileId: orders.artisanProfileId,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);
  if (!order) return err('Order not found');

  let filedByRole: 'buyer' | 'seller';
  if (order.buyerUserId === filer.id) {
    filedByRole = 'buyer';
    const verified = assertVerifiedEmail(filer); // gate buyers only
    if (!verified.ok) return err(verified.error);
  } else {
    const [a] = await db
      .select({ id: artisanProfiles.id })
      .from(artisanProfiles)
      .where(
        and(eq(artisanProfiles.id, order.artisanProfileId), eq(artisanProfiles.userId, filer.id)),
      )
      .limit(1);
    if (!a) return err('Not authorized to dispute this order');
    filedByRole = 'seller';
  }

  // Pre-generate the dispute id so the order_events row written by
  // transitionOrder carries it in metadataJson at insert time — no
  // post-transaction back-fill, so the append-only audit log is never
  // updated. The orderDisputes row below is inserted with this exact id.
  const disputeId = randomUUID();

  const result = await transitionOrder({
    orderId: order.id,
    expectedFrom: [
      'pending_seller_response',
      'pending_payment_arrangement',
      'payment_received',
      'shipped',
    ],
    toStatus: 'disputed',
    actorUserId: filer.id,
    actorRole: filedByRole,
    eventType: 'disputed',
    notes: parsed.data.reason,
    metadataJson: { disputeId },
    fieldUpdates: { disputedAt: new Date() },
    onTransition: async (tx, o) => {
      try {
        await tx.insert(orderDisputes).values({
          id: disputeId,
          orderId: o.id,
          filedByUserId: filer.id,
          filedByRole,
          status: 'open',
          reason: parsed.data.reason,
          // Pre-populate the filer's side of the statement so admins
          // see both parties' positions in one place when the
          // non-filer eventually responds.
          ...(filedByRole === 'buyer'
            ? { buyerStatement: parsed.data.reason }
            : { sellerStatement: parsed.data.reason }),
        });
      } catch (e) {
        // Partial unique index violation → there's already an active
        // dispute. Translate to a clean Result error so the constraint
        // name doesn't leak to the caller.
        if (
          e instanceof Error &&
          /order_disputes_active_per_order|duplicate key value/i.test(e.message)
        ) {
          throw new Error('There is already an active dispute on this order');
        }
        throw e;
      }
    },
  });

  if (!result.ok) return err(result.error);

  return ok({ disputeId });
}

/**
 * Add a statement to an existing open/under_review dispute. Either
 * party can call this — buyer fills `buyer_statement`, seller fills
 * `seller_statement`. This is not a transition (the order stays
 * disputed); it's a write to the dispute row only.
 */
export async function respondToDispute(input: unknown): Promise<Result<{ disputeId: string }>> {
  const parsed = disputeRespondInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid dispute response', parsed.error.flatten().fieldErrors);

  const responder = await tryRequireUser();
  if (!responder) return err(NOT_AUTHENTICATED_MESSAGE);

  // The read-check-update runs in one transaction with the active
  // dispute row locked FOR UPDATE. A concurrent resolveDispute that
  // flips the dispute to a resolved status either blocks here, or —
  // once it commits — causes the locked re-read to no longer match the
  // open/under_review filter, so a statement can't land on a dispute an
  // admin has already resolved.
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        buyerUserId: orders.buyerUserId,
        artisanProfileId: orders.artisanProfileId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, parsed.data.orderId))
      .limit(1);
    if (!order) return err('Order not found');
    if (order.status !== 'disputed') return err('Order is not currently disputed');

    let responderRole: 'buyer' | 'seller';
    if (order.buyerUserId === responder.id) {
      responderRole = 'buyer';
    } else {
      const [a] = await tx
        .select({ id: artisanProfiles.id })
        .from(artisanProfiles)
        .where(
          and(
            eq(artisanProfiles.id, order.artisanProfileId),
            eq(artisanProfiles.userId, responder.id),
          ),
        )
        .limit(1);
      if (!a) return err('Not authorized to respond on this order');
      responderRole = 'seller';
    }

    // Lock the active dispute (open or under_review) FOR UPDATE. The
    // status predicate doubles as the re-check: if a concurrent
    // resolveDispute committed first, the locked row no longer matches
    // and this returns empty. Phase 1's partial unique index guarantees
    // at most one such row.
    const [active] = await tx
      .select({ id: orderDisputes.id })
      .from(orderDisputes)
      .where(
        and(
          eq(orderDisputes.orderId, order.id),
          inArray(orderDisputes.status, ['open', 'under_review']),
        ),
      )
      .for('update')
      .limit(1);
    if (!active) return err('No active dispute to respond to');

    await tx
      .update(orderDisputes)
      .set(
        responderRole === 'buyer'
          ? { buyerStatement: parsed.data.statement }
          : { sellerStatement: parsed.data.statement },
      )
      .where(eq(orderDisputes.id, active.id));

    return ok({ disputeId: active.id });
  });
}

// -----------------------------------------------------------------------------
// Admin actions — Phase 9
// -----------------------------------------------------------------------------

// Audit an admin order action AFTER its transition has committed. The
// transition owns its own db.transaction and is already irreversible by the
// time we get here, so a failed audit insert is LOGGED (never silently
// swallowed) but must not flip a succeeded action into a failure — the order
// really did change. This is the sanctioned exception to the re-raise rule:
// the failure reaches monitoring while the truthful success Result stands.
async function auditOrderAdminAction(input: {
  actorUserId: string;
  action: 'resolve_dispute' | 'force_cancel_order' | 'force_complete_order';
  orderId: string;
  reason: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await recordAdminAction({
      actorUserId: input.actorUserId,
      action: input.action,
      targetUserId: null,
      reason: input.reason,
      metadata: input.metadata,
    });
  } catch (e) {
    const log = await getRequestLogger();
    log.error(
      { err: e, orderId: input.orderId, action: input.action },
      'audit write failed after admin order action',
    );
  }
}

// Stock-handling per Issue 10 (Phase 8 matrix): the question is always
// "did the item physically leave the seller's possession." If shippedAt
// is set, the item is gone — returning stock creates a phantom inventory.
// If shippedAt is null, the item never moved — return stock cleanly.
// This is the same check returnStockIfPreShipment uses, but we make the
// call site explicit on the admin paths so the matrix's "for_buyer +
// shipped → don't return" rule is visible in the action body.

/**
 * Admin resolves a dispute. Maps:
 *
 *   resolution            order_status_at_resolve_time   final_status        stock_return
 *   resolved_for_buyer    pre-shipment                   cancelled_by_seller yes (item never moved)
 *   resolved_for_buyer    shipped (or post-shipment)     cancelled_by_seller NO  (phantom risk)
 *   resolved_for_seller   any                            completed           NO  (counts as sale)
 *   resolved_neutral      pre-shipment                   cancelled_by_seller yes
 *   resolved_neutral      shipped (or post-shipment)     completed           NO
 *
 * The dispute row gets its status flipped to one of the three resolved_*
 * values, plus the admin's resolution text. The order_events row records
 * the resolution with `admin_intervention` event type.
 */
export async function resolveDispute(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = disputeResolveInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  // Load the order to determine pre/post shipment for the stock matrix.
  const [order] = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      shippedAt: orders.shippedAt,
    })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);
  if (!order) return err('Order not found');
  if (order.status !== 'disputed') return err('Order is not currently disputed');

  // Map resolution → final order status + whether to return stock.
  const wasShipped = order.shippedAt !== null;
  let toStatus: OrderStatus;
  let returnStock: boolean;
  switch (parsed.data.resolution) {
    case 'resolved_for_buyer':
      toStatus = 'cancelled_by_seller';
      // Don't return shipped stock — phantom inventory.
      returnStock = !wasShipped;
      break;
    case 'resolved_for_seller':
      toStatus = 'completed';
      returnStock = false;
      break;
    case 'resolved_neutral':
      // Neutral resolution: if the item ever shipped, treat as
      // completed; otherwise treat as a no-fault cancellation.
      toStatus = wasShipped ? 'completed' : 'cancelled_by_seller';
      returnStock = !wasShipped;
      break;
    default: {
      // Exhaustiveness guard: a new resolution value added to the Zod
      // enum without a matching case trips this at compile time.
      const _exhaustive: never = parsed.data.resolution;
      throw new Error(`Unhandled dispute resolution: ${String(_exhaustive)}`);
    }
  }

  const result = await transitionOrder({
    orderId: order.id,
    expectedFrom: ['disputed'],
    toStatus,
    actorUserId: admin.id,
    actorRole: 'admin',
    eventType: 'dispute_resolved',
    notes: parsed.data.adminResolution,
    metadataJson: { resolution: parsed.data.resolution },
    fieldUpdates: {
      disputeResolvedAt: new Date(),
      ...(toStatus === 'completed' ? { completedAt: new Date() } : { cancelledAt: new Date() }),
    },
    onTransition: async (tx, o) => {
      // Update the dispute row to the resolved status. Limited to the
      // currently-active dispute (open or under_review) per the partial
      // unique index.
      await tx
        .update(orderDisputes)
        .set({
          status: parsed.data.resolution,
          adminResolution: parsed.data.adminResolution,
          resolvedByAdminUserId: admin.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(orderDisputes.orderId, o.id),
            inArray(orderDisputes.status, ['open', 'under_review']),
          ),
        );

      if (returnStock) {
        await returnStockIfPreShipment(tx, o);
      }
    },
  });

  if (result.ok) {
    await auditOrderAdminAction({
      actorUserId: admin.id,
      action: 'resolve_dispute',
      orderId: order.id,
      reason: parsed.data.adminResolution,
      metadata: {
        orderId: order.id,
        reference: order.reference,
        resolution: parsed.data.resolution,
      },
    });
  }

  return result;
}

/**
 * Admin force-cancels a non-disputed order. Use case: seller account
 * terminated, fraud confirmed, an order is stuck and parties have
 * dropped contact. Stock returns iff pre-shipment.
 */
export async function adminForceCancel(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = adminForceActionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  // Read the reference up front so the audit row carries a human-readable
  // label, matching resolveDispute. transitionOrder re-validates existence.
  const [orderRow] = await db
    .select({ reference: orders.reference })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);

  const result = await transitionOrder({
    orderId: parsed.data.orderId,
    // Any non-terminal state. Disputed has its own path (resolveDispute).
    expectedFrom: [
      'pending_seller_response',
      'pending_payment_arrangement',
      'payment_received',
      'shipped',
    ],
    toStatus: 'cancelled_by_seller',
    actorUserId: admin.id,
    actorRole: 'admin',
    eventType: 'admin_intervention',
    notes: parsed.data.reason,
    metadataJson: { action: 'force_cancel', reason: parsed.data.reason },
    fieldUpdates: {
      cancelledAt: new Date(),
      cancellationReason: 'other',
      cancellationNotes: parsed.data.reason,
    },
    onTransition: returnStockIfPreShipment,
  });

  if (result.ok) {
    await auditOrderAdminAction({
      actorUserId: admin.id,
      action: 'force_cancel_order',
      orderId: parsed.data.orderId,
      reason: parsed.data.reason,
      metadata: { orderId: parsed.data.orderId, reference: orderRow?.reference },
    });
  }

  return result;
}

/**
 * Admin force-completes a non-disputed order. Use case: edge cases
 * where the seller shipped, buyer confirmed verbally but never marked
 * received, and the order is stuck in `shipped` past the auto-confirm.
 * Doesn't return stock (the item has presumably been delivered).
 */
export async function adminForceComplete(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = adminForceActionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  // Read the reference up front so the audit row carries a human-readable
  // label, matching resolveDispute. transitionOrder re-validates existence.
  const [orderRow] = await db
    .select({ reference: orders.reference })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);

  const result = await transitionOrder({
    orderId: parsed.data.orderId,
    // Only meaningful from shipped; admin shouldn't bypass earlier
    // states by force-completing prematurely.
    expectedFrom: ['shipped'],
    toStatus: 'completed',
    actorUserId: admin.id,
    actorRole: 'admin',
    eventType: 'admin_intervention',
    notes: parsed.data.reason,
    metadataJson: { action: 'force_complete', reason: parsed.data.reason },
    fieldUpdates: { completedAt: new Date() },
  });

  if (result.ok) {
    await auditOrderAdminAction({
      actorUserId: admin.id,
      action: 'force_complete_order',
      orderId: parsed.data.orderId,
      reason: parsed.data.reason,
      metadata: { orderId: parsed.data.orderId, reference: orderRow?.reference },
    });
  }

  return result;
}
