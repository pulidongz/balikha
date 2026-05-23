import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '@/db';
import { messageThreads } from '@/db/schema';

// Tx-bound thread pivot: link a still-pre-purchase thread to the order
// the buyer just placed. Mirrors the bounded-context shape of
// fanOutMessageNotification — the messaging-domain write that
// placeOrder needs lives next to the other messaging-tx helpers, not
// inlined inside the orders action.
//
// The WHERE clause encodes the same "active pre-purchase" invariant as
// the partial unique index `message_threads_active_pre_purchase_idx`
// (thread belongs to this buyer + this product + has no orderId yet),
// in one round-trip and IDOR-safe.
//
// Returns `linked: false` for a stale or already-converted thread.
// The caller decides whether to fail or proceed — placeOrder treats a
// false return as a non-fatal "thread link skipped" because the order
// is the buyer's actual goal.
export async function pivotPrePurchaseThreadToOrder(
  tx: Tx,
  args: { threadId: string; buyerUserId: string; productId: string; orderId: string },
): Promise<{ linked: boolean }> {
  const updated = await tx
    .update(messageThreads)
    .set({ orderId: args.orderId, updatedAt: new Date() })
    .where(
      and(
        eq(messageThreads.id, args.threadId),
        eq(messageThreads.buyerUserId, args.buyerUserId),
        eq(messageThreads.productId, args.productId),
        isNull(messageThreads.orderId),
      ),
    )
    .returning({ id: messageThreads.id });
  return { linked: updated.length > 0 };
}
