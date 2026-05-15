'use server';

import { revalidateTag } from 'next/cache';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  artisanProfiles,
  idempotencyKeys,
  notifications,
  orderDisputes,
  orderEvents,
  orders,
  productImages,
  products,
  userAddresses,
} from '@/db/schema';
import { requireAdmin, requireArtisan, requireUser } from '@/lib/auth-helpers';
import { IDEMPOTENCY_TTL_MS, withIdempotency } from '@/lib/idempotency';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { generateOrderReference } from '@/lib/orders/reference';
import { returnStockIfPreShipment } from '@/lib/orders/stock';
import type { ActorRole, Order, OrderEventType, OrderStatus } from '@/lib/orders/types';
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
 * The button's UX path: `success → router.push('/shop/[artisan]/[product]?reorder=1')`
 * → OrderButton on that page detects ?reorder=1 and auto-opens the
 * dialog with a fresh address selection.
 */
export async function reorderAction(input: {
  orderId: string;
}): Promise<Result<{ productId: string; productSlug: string; artisanSlug: string }>> {
  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

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
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.id, order.productId))
    .limit(1);
  if (!row) return err('That piece is no longer available.');

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
 * The fix has THREE parts that must all be present:
 * 1. Advisory lock at the top of the transaction, keyed on
 *    idempotencyKey, serializes concurrent fn() invocations.
 * 2. The idempotency cache row is written INSIDE this transaction
 *    (see the idempotencyKeys insert in the callback), so it commits
 *    while the advisory lock is still held. withIdempotency's own
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

          // Write the idempotency cache row INSIDE this transaction so
          // it commits atomically with the order, while the advisory
          // lock above is still held. A concurrent retry's in-lock
          // re-check then sees this committed row and returns the
          // cached result instead of placing a duplicate order.
          // withIdempotency's post-fn() insert is left as a harmless
          // no-op by onConflictDoNothing.
          if (parsed.data.idempotencyKey) {
            await tx
              .insert(idempotencyKeys)
              .values({
                key: parsed.data.idempotencyKey,
                userId: buyer.id,
                scope: 'placeOrder',
                responseJson: JSON.stringify(ok({ orderId: order.id, reference })),
                expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
              })
              .onConflictDoNothing();
          }

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

// Closed set of fields callers can mutate via transitionOrder. The helper
// owns the `status` write (toStatus param); the rest are timestamps and
// notes that go along with specific transitions. id, buyerUserId,
// artisanProfileId, and the snapshot fields are intentionally absent —
// loose typing here would invite callers to smuggle in mutations that
// bypass the helper's discipline.
type TransitionFieldUpdates = Partial<
  Pick<
    Order,
    | 'acceptedAt'
    | 'declinedAt'
    | 'paymentReceivedAt'
    | 'shippedAt'
    | 'completedAt'
    | 'cancelledAt'
    | 'cancellationReason'
    | 'cancellationNotes'
    | 'disputedAt'
    | 'disputeResolvedAt'
  >
>;

interface TransitionOrderOpts {
  orderId: string;
  expectedFrom: readonly OrderStatus[];
  toStatus: OrderStatus;
  // null when actorRole === 'system' (Phase 6 tick). The DB column is
  // also nullable so the audit log can record un-actored events.
  actorUserId: string | null;
  actorRole: ActorRole;
  // Skipped when actorRole === 'system' (the tick has already filtered
  // to the orders it intends to act on). Returning false from the check
  // causes the transition to fail with 'Not authorized'.
  authorizationCheck?: (order: Order) => boolean;
  eventType: OrderEventType;
  notes?: string;
  metadataJson?: Record<string, unknown>;
  fieldUpdates?: TransitionFieldUpdates;
  // Hook for side-effects that must be atomic with the status flip
  // (e.g. stock return, dispute-row insert). Runs inside the same
  // transaction, after the status update and audit event are written.
  onTransition?: (tx: Tx, order: Order) => Promise<void>;
}

/**
 * Canonical chokepoint for every order-status mutation. Every accept,
 * decline, ship, cancel, dispute filing, admin force-action, and system
 * tick goes through here. Writing `db.update(orders).set({ status })`
 * anywhere else bypasses audit logging + reputation cache invalidation
 * and is forbidden (§12 Conventions in the plan).
 *
 * INSIDE db.transaction:
 *   1. Load order with FOR UPDATE
 *   2. Verify status is in expectedFrom
 *   3. If actorRole !== 'system', run authorizationCheck
 *   4. UPDATE order: status + lifecycle timestamps + fieldUpdates
 *   5. INSERT order_events row (actor_user_id may be null)
 *   6. Fan out one notification per the Phase 4.5 matrix (skip system)
 *   7. Run onTransition for additional atomic writes
 *
 * AFTER db.transaction(...) resolves:
 *   8. revalidateTag(`reputation:${artisanId}`, 'max')
 *
 * The post-commit invalidation runs for ALL transitions, including
 * system events — a backlog of auto-cancellations should drop the
 * artisan's fulfillment rate immediately, not wait for the 5-minute
 * TTL. The notification-fan-out gate (Phase 4.5) is asymmetric to this
 * (notifications skip system events; cache invalidation does not).
 */
export async function transitionOrder(
  opts: TransitionOrderOpts,
): Promise<Result<{ orderId: string }>> {
  let artisanProfileId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // 1. Load with FOR UPDATE — serializes concurrent attempts on the
      //    same order so the expectedFrom check is meaningful.
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, opts.orderId))
        .for('update')
        .limit(1);
      if (!order) throw new Error('Order not found');

      // 2. State-machine guard. Hits if a concurrent retry or stale
      //    client click tries to act on an already-progressed order.
      if (!opts.expectedFrom.includes(order.status)) {
        throw new Error(`Invalid state: order is ${order.status}`);
      }

      // 3. Authorization. System callers (Phase 6 tick) have already
      //    pre-filtered, so skip the check for them.
      if (opts.actorRole !== 'system' && opts.authorizationCheck) {
        if (!opts.authorizationCheck(order)) {
          throw new Error('Not authorized for this order');
        }
      }

      // 4. UPDATE: status + caller-supplied lifecycle fields.
      await tx
        .update(orders)
        .set({
          status: opts.toStatus,
          ...(opts.fieldUpdates ?? {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      // 5. Audit event. metadataJson shape is contractual per Phase 1.
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: opts.eventType,
        actorUserId: opts.actorUserId,
        actorRole: opts.actorRole,
        notes: opts.notes ?? null,
        metadataJson: opts.metadataJson ?? null,
      });

      // 6. Notifications fan-out. Inside the same transaction so a
      //    notification insert failure rolls back the status change +
      //    audit event together — atomicity per Phase 4.5 / Issue 7.
      //    System events are skipped here (notifications gate ≠ cache
      //    gate); buyer/seller paths only for now, admin handling lands
      //    with Phase 9.
      await fanOutTransitionNotification(tx, order, opts.toStatus, opts.actorRole);

      // 7. Side-effect hook (stock return, dispute-row insert, etc.).
      if (opts.onTransition) {
        await opts.onTransition(tx, order);
      }

      artisanProfileId = order.artisanProfileId;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transition failed';
    return err(message);
  }

  // 8. Post-commit reputation cache invalidation. Outside the tx so the
  //    cache invalidates after the new data has committed, not before.
  //    revalidateTag requires Next's static-generation-store, which
  //    isn't available from CLI scripts (orders-tick). Catch that one
  //    specific error and skip — the 5-minute cache TTL covers the gap.
  //    Any other revalidate error rethrows as a transition failure
  //    (no general error swallowing).
  if (artisanProfileId) {
    try {
      revalidateTag(`reputation:${artisanProfileId}`, 'max');
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('static generation store missing'))) {
        throw e;
      }
      // Tick-script branch: readers will re-derive on TTL expiry.
    }
  }
  return ok({ orderId: opts.orderId });
}

// -----------------------------------------------------------------------------
// Notification fan-out — Phase 4.5
// -----------------------------------------------------------------------------

// (toStatus, actorRole) → 0 or 1 notification(s) inside the transition's
// transaction. The matrix per the plan:
//
//   accepted (toStatus=pending_payment_arrangement, actorRole=seller)
//     → notify buyer: "Your order was accepted"
//   shipped (toStatus=shipped, actorRole=seller)
//     → notify buyer: "Your order is on the way"
//   completed (toStatus=completed, actorRole=buyer)  [manual mark-received]
//     → notify seller: "Order completed"
//   disputed (toStatus=disputed, actorRole=buyer)
//     → notify seller: "Dispute filed on your order"
//   disputed (toStatus=disputed, actorRole=seller)
//     → notify buyer: "Dispute filed on your order"
//
// System actor: skipped this phase — the messaging plan revisits
// timing/quiet-hours/digesting for auto-cancellation and auto-completion.
// Admin actor: deferred to Phase 9 (admin force-actions will notify both
// parties with admin-aware copy).
//
// Atomicity: this insert is inside the same transaction as the order
// UPDATE + audit event. A FK violation against a deleted user (or any
// other notification-insert failure) rolls the whole transition back —
// status stays put, no audit row written, the action surfaces an error
// to the caller. Trade-off documented in plan §6.5.
async function fanOutTransitionNotification(
  tx: Tx,
  order: Order,
  toStatus: OrderStatus,
  actorRole: ActorRole,
): Promise<void> {
  // System events skipped in this phase; admin notifications land with
  // Phase 9. Buyer/seller paths only.
  if (actorRole === 'system' || actorRole === 'admin') return;

  // Decide recipient + copy from the (toStatus, actorRole) pair.
  type Recipient = { userId: string; url: string };

  async function sellerRecipient(): Promise<Recipient | null> {
    const [row] = await tx
      .select({ userId: artisanProfiles.userId })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.id, order.artisanProfileId))
      .limit(1);
    if (!row) return null;
    return { userId: row.userId, url: `/dashboard/orders/${order.id}` };
  }
  function buyerRecipient(): Recipient {
    return { userId: order.buyerUserId, url: `/account/orders/${order.id}` };
  }

  let recipient: Recipient | null = null;
  let title = '';

  if (toStatus === 'pending_payment_arrangement' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Your order was accepted';
  } else if (toStatus === 'shipped' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Your order is on the way';
  } else if (toStatus === 'completed' && actorRole === 'buyer') {
    recipient = await sellerRecipient();
    title = 'Order completed';
  } else if (toStatus === 'disputed' && actorRole === 'buyer') {
    recipient = await sellerRecipient();
    title = 'Dispute filed on your order';
  } else if (toStatus === 'disputed' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Dispute filed on your order';
  } else {
    // Not in the matrix — silently skip. Cancellation notifications and
    // other states deferred to the messaging plan.
    return;
  }

  if (!recipient) return; // seller lookup failed; bail out without an error.

  await tx.insert(notifications).values({
    userId: recipient.userId,
    type: 'order_status_changed',
    title,
    body: `Order ${order.reference}`,
    target: {
      kind: 'order',
      id: order.id,
      url: recipient.url,
    },
  });
}

// -----------------------------------------------------------------------------
// Seller actions
// -----------------------------------------------------------------------------

export async function acceptOrder(input: unknown): Promise<Result<{ orderId: string }>> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await requireArtisan().catch(() => null);
  if (!seller) return err('Artisan profile required');

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

  const seller = await requireArtisan().catch(() => null);
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

  const seller = await requireArtisan().catch(() => null);
  if (!seller) return err('Artisan profile required');

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

  const seller = await requireArtisan().catch(() => null);
  if (!seller) return err('Artisan profile required');

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

  const seller = await requireArtisan().catch(() => null);
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

  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

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

  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

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

  const filer = await requireUser().catch(() => null);
  if (!filer) return err('Not authenticated');

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

  // Capture the disputeId from inside the transaction so we can return
  // it after the helper resolves successfully.
  let disputeId: string | null = null;

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
    fieldUpdates: { disputedAt: new Date() },
    onTransition: async (tx, o) => {
      try {
        const [inserted] = await tx
          .insert(orderDisputes)
          .values({
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
          })
          .returning({ id: orderDisputes.id });
        disputeId = inserted?.id ?? null;
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
    // metadataJson on order_events references the disputeId; populated
    // post-transaction below since the dispute row is generated mid-tx.
  });

  if (!result.ok) return err(result.error);
  if (!disputeId) return err('Dispute creation failed');

  // Patch the audit event's metadata with the disputeId. This is the
  // one place we update an event row — and it's a fill-in, not a
  // rewrite. Filtered to the most recent matching event so we don't
  // accidentally back-fill an earlier one (the partial unique index
  // guarantees there's at most one current `disputed` event).
  await db
    .update(orderEvents)
    .set({ metadataJson: { disputeId } })
    .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, 'disputed')));

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

  const responder = await requireUser().catch(() => null);
  if (!responder) return err('Not authenticated');

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
  if (order.status !== 'disputed') return err('Order is not currently disputed');

  let responderRole: 'buyer' | 'seller';
  if (order.buyerUserId === responder.id) {
    responderRole = 'buyer';
  } else {
    const [a] = await db
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

  // Update the most recent active dispute (open or under_review).
  // Phase 1's partial unique index guarantees at most one such row.
  const [active] = await db
    .select({ id: orderDisputes.id })
    .from(orderDisputes)
    .where(
      and(
        eq(orderDisputes.orderId, order.id),
        inArray(orderDisputes.status, ['open', 'under_review']),
      ),
    )
    .limit(1);
  if (!active) return err('No active dispute to respond to');

  await db
    .update(orderDisputes)
    .set(
      responderRole === 'buyer'
        ? { buyerStatement: parsed.data.statement }
        : { sellerStatement: parsed.data.statement },
    )
    .where(eq(orderDisputes.id, active.id));

  return ok({ disputeId: active.id });
}

// -----------------------------------------------------------------------------
// Admin actions — Phase 9
// -----------------------------------------------------------------------------

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

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  // Load the order to determine pre/post shipment for the stock matrix.
  const [order] = await db
    .select({
      id: orders.id,
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

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  return transitionOrder({
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

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  return transitionOrder({
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
}
