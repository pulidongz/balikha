import { z } from 'zod';

// Input shape for `placeOrder`. The idempotencyKey is client-generated
// (UUID via crypto.randomUUID()) and lets the server dedupe rapid
// double-submits. Note that the server pairs this with a transaction-
// scoped Postgres advisory lock — the wrapper alone has a documented race
// window (lib/idempotency.ts:30) that's benign for naturally-idempotent
// actions but creates duplicate orders without the lock when the action
// has stock side effects.
export const orderPlaceSchema = z.object({
  productId: z.string().uuid(),
  shippingAddressId: z.string().uuid(),
  notesFromBuyer: z.string().max(2000).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type OrderPlaceInput = z.infer<typeof orderPlaceSchema>;

// Transition actions (accept, mark shipped, etc.) are naturally idempotent
// at the state-machine level: `expectedFrom` + FOR UPDATE in the helper
// guarantees a duplicate retry hits an "Invalid state" error rather than
// re-running the transition. A buyer who clicks "Mark received" twice
// gets a clear error message — that's better UX than silent dedup. So
// these schemas deliberately do NOT include an idempotencyKey field.
//
// Only `placeOrder` uses the idempotency wrapper + advisory lock, because
// creating an order is non-idempotent (every call would create a new row
// and decrement stock).

// Used by acceptOrder, markPaymentReceived, markShipped, markReceived.
// Notes are an artisan/buyer comment that lands on the order_event.
export const orderTransitionInputSchema = z.object({
  orderId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

export type OrderTransitionInput = z.infer<typeof orderTransitionInputSchema>;

// Cancellation requires a reason — drives analytics and the seller's
// reputation context.
export const cancellationReasonSchema = z.enum([
  'seller_no_response',
  'buyer_changed_mind',
  'seller_unable_to_fulfill',
  'item_unavailable',
  'payment_disagreement',
  'shipping_disagreement',
  'other',
]);

export const orderCancelInputSchema = z.object({
  orderId: z.string().uuid(),
  reason: cancellationReasonSchema,
  notes: z.string().max(1000).optional(),
});

export type OrderCancelInput = z.infer<typeof orderCancelInputSchema>;
