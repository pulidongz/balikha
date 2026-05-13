'use server';

import { revalidateTag } from 'next/cache';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  artisanProfiles,
  idempotencyKeys,
  notifications,
  orderEvents,
  orders,
  productImages,
  products,
  userAddresses,
} from '@/db/schema';
import { requireArtisan, requireUser } from '@/lib/auth-helpers';
import { withIdempotency } from '@/lib/idempotency';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { generateOrderReference } from '@/lib/orders/reference';
import type { ActorRole, Order, OrderEventType, OrderStatus } from '@/lib/orders/types';
import {
  orderCancelInputSchema,
  orderPlaceSchema,
  orderTransitionInputSchema,
} from '@/lib/validators/order';

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

  // 7. Post-commit reputation cache invalidation. Outside the tx so the
  //    cache invalidates after the new data has committed, not before.
  if (artisanProfileId) {
    revalidateTag(`reputation:${artisanProfileId}`, 'max');
  }
  return ok({ orderId: opts.orderId });
}

// -----------------------------------------------------------------------------
// Stock return — shared onTransition for pre-shipment cancellations.
// -----------------------------------------------------------------------------

// The check `order.shippedAt === null` is the durable signal of "did
// this item physically leave the seller's possession." Stock-handling
// matrix per Phase 8: shipped → don't return (creates a phantom
// inventory); pre-shipment → return (the item never moved).
async function returnStockIfPreShipment(tx: Tx, order: Order): Promise<void> {
  if (order.shippedAt !== null) return;
  if (!order.productId) return;

  const [product] = await tx
    .select()
    .from(products)
    .where(eq(products.id, order.productId))
    .for('update')
    .limit(1);
  if (!product) return;

  await tx
    .update(products)
    .set({
      stockOnHand: product.stockOnHand + 1,
      // If the product was flipped to sold_out by the placement that
      // we're now reversing, bring it back to published. Other statuses
      // (draft, archived) stay as the seller left them.
      status: product.status === 'sold_out' ? 'published' : product.status,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));
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
