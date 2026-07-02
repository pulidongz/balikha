// Canonical order-status transition engine. Intentionally NOT a `'use server'`
// module: `transitionOrder` accepts an `actorRole` and an OPTIONAL
// `authorizationCheck` callback, and delegates the auth decision to that
// callback. Callbacks cannot cross the server-action boundary (a client can
// only send serializable args), so if this were an exported server action a
// direct call would arrive with `authorizationCheck` undefined — skipping the
// check entirely and letting any caller drive any order through its lifecycle.
// Keeping it as a plain server-only helper means only trusted server callers
// (the guarded actions in lib/actions/orders.ts and the orders-tick CLI) can
// reach it, and each supplies its own ownership/role check.
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import { artisanProfiles, notifications, orderEvents, orders } from '@/db/schema';
import { logAnalyticsEvent, type AnalyticsEventType } from '@/lib/analytics/log';
import {
  dispatchOrderEmail,
  type OrderEmailDispatch,
  type OrderEmailKind,
} from '@/lib/email/notifications';
import { ok, err, type Result } from '@/lib/result';
import type { ActorRole, Order, OrderEventType, OrderStatus } from '@/lib/orders/types';

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
  // When true, skip the post-commit revalidateTag call. Set by CLI
  // callers (the orders-tick script) where Next's static-generation
  // store is absent; those readers fall back to the 5-minute cache TTL.
  skipRevalidation?: boolean;
}

// Maps an order_events.type to its funnel analytics event. Only the
// four ticketed transitions are present; everything else is omitted on
// purpose. Centralising here means completions reached via the CLI
// orders:tick auto-complete sweep are captured too (they matter for the
// completed-orders north-star) — logAnalyticsEvent reads request_id
// defensively so the headers()-less CLI caller does not throw.
const ANALYTICS_EVENT_BY_ORDER_EVENT: Partial<
  Record<TransitionOrderOpts['eventType'], AnalyticsEventType>
> = {
  accepted: 'order_accepted',
  payment_received: 'payment_received',
  completed: 'order_completed',
  disputed: 'dispute_filed',
};

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
  let artisanProfileId: string;
  let emailDispatches: OrderEmailDispatch[] = [];

  try {
    artisanProfileId = await db.transaction(async (tx) => {
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
      //    gate); buyer, seller, and admin transitions all fan out.
      emailDispatches = await fanOutTransitionNotification(
        tx,
        order,
        opts.toStatus,
        opts.actorRole,
      );

      // 7. Side-effect hook (stock return, dispute-row insert, etc.).
      if (opts.onTransition) {
        await opts.onTransition(tx, order);
      }

      return order.artisanProfileId;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transition failed';
    return err(message);
  }

  // 8. Post-commit reputation cache invalidation. Outside the tx so the
  //    cache invalidates after the new data has committed, not before.
  //    revalidateTag needs Next's static-generation store, which is
  //    absent in CLI scripts (orders-tick) — those callers pass
  //    skipRevalidation and rely on the 5-minute cache TTL instead.
  if (!opts.skipRevalidation) {
    revalidateTag(`reputation:${artisanProfileId}`, 'max');
  }
  const analyticsType =
    ANALYTICS_EVENT_BY_ORDER_EVENT[opts.eventType] ??
    (opts.toStatus === 'completed' ? 'order_completed' : undefined);
  if (analyticsType) {
    await logAnalyticsEvent({
      type: analyticsType,
      userId: opts.actorUserId ?? null,
      artisanProfileId,
      entityType: 'order',
      entityId: opts.orderId,
      metadata: { actorRole: opts.actorRole, orderEventType: opts.eventType },
    });
  }
  if (emailDispatches.length > 0) {
    const dispatches = emailDispatches;
    // Admin force-actions email BOTH parties; send them concurrently
    // after the response (plan review Issues 3 + 4). Each dispatcher
    // swallows its own errors, so Promise.all never rejects.
    after(() => Promise.all(dispatches.map((d) => dispatchOrderEmail(d))));
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
//   admin force-action (actorRole=admin, toStatus=cancelled_by_seller
//     or completed) → notify BOTH parties with support-team copy
//
// System actor: skipped — the messaging plan revisits timing / quiet-
// hours / digesting for auto-cancellation and auto-completion.
// Admin actor: notifies BOTH parties — force-cancel, force-complete, and
// dispute resolution all change the order out from under buyer & seller.
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
): Promise<OrderEmailDispatch[]> {
  // System events skip notification fan-out (deferred to the messaging plan).
  if (actorRole === 'system') return [];

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

  const dispatches: OrderEmailDispatch[] = [];
  function queueEmail(r: Recipient, kind: OrderEmailKind) {
    dispatches.push({
      recipientUserId: r.userId,
      kind,
      orderReference: order.reference,
      productTitle: order.productTitleSnapshot,
      url: r.url,
      imagePath: order.productImageUrlSnapshot,
    });
  }

  // Admin force-actions notify BOTH parties.
  if (actorRole === 'admin') {
    let adminTitle: string;
    let adminKind: OrderEmailKind;
    if (toStatus === 'cancelled_by_seller') {
      adminTitle = 'Your order was cancelled by Balikha support';
      adminKind = 'order_admin_cancelled';
    } else if (toStatus === 'completed') {
      adminTitle = 'Your order was completed by Balikha support';
      adminKind = 'order_admin_completed';
    } else {
      return [];
    }
    const buyer = buyerRecipient();
    const seller = await sellerRecipient();
    const adminRecipients: Recipient[] = seller ? [buyer, seller] : [buyer];
    for (const r of adminRecipients) {
      await tx.insert(notifications).values({
        userId: r.userId,
        type: 'order_status_changed',
        title: adminTitle,
        body: `Order ${order.reference}`,
        target: { kind: 'order', id: order.id, url: r.url },
      });
      queueEmail(r, adminKind);
    }
    return dispatches;
  }

  let recipient: Recipient | null = null;
  let title = '';
  let kind: OrderEmailKind | null = null;

  if (toStatus === 'pending_payment_arrangement' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Your order was accepted';
    kind = 'order_accepted';
  } else if (toStatus === 'shipped' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Your order is on the way';
    kind = 'order_shipped';
  } else if (toStatus === 'completed' && actorRole === 'buyer') {
    recipient = await sellerRecipient();
    title = 'Order completed';
    kind = 'order_completed';
  } else if (toStatus === 'disputed' && actorRole === 'buyer') {
    recipient = await sellerRecipient();
    title = 'Dispute filed on your order';
    kind = 'order_disputed';
  } else if (toStatus === 'disputed' && actorRole === 'seller') {
    recipient = buyerRecipient();
    title = 'Dispute filed on your order';
    kind = 'order_disputed';
  } else {
    // Not in the matrix — no in-app notification and no email.
    return [];
  }

  if (!recipient || !kind) return [];

  await tx.insert(notifications).values({
    userId: recipient.userId,
    type: 'order_status_changed',
    title,
    body: `Order ${order.reference}`,
    target: { kind: 'order', id: order.id, url: recipient.url },
  });
  queueEmail(recipient, kind);
  return dispatches;
}
