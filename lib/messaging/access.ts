import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanProfiles,
  buyerBlockedSellers,
  messageThreads,
  orders,
  sellerBlockedBuyers,
} from '@/db/schema';
import { err, ok, type Result } from '@/lib/result';
import type { OrderStatus } from '@/lib/orders/types';
import type { MessageThread, MessageSenderRole, ThreadWriteState } from './types';

// Resolves caller's role on a thread (buyer or seller) and returns
// the thread + role. Returns "Thread not found" (not 403) for non-
// participants — privacy stance matches the order-detail-page
// pattern (lib/actions/orders.ts:reorderAction).
export async function assertThreadAccess(
  threadId: string,
  callerUserId: string,
): Promise<Result<{ thread: MessageThread; role: MessageSenderRole }>> {
  const [thread] = await db
    .select()
    .from(messageThreads)
    .where(eq(messageThreads.id, threadId))
    .limit(1);
  if (!thread) return err('Thread not found');

  if (thread.buyerUserId === callerUserId) {
    return ok({ thread, role: 'buyer' });
  }

  const [artisan] = await db
    .select({ userId: artisanProfiles.userId })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.id, thread.artisanProfileId))
    .limit(1);
  if (artisan && artisan.userId === callerUserId) {
    return ok({ thread, role: 'seller' });
  }

  return err('Thread not found');
}

// Pure derivation of a thread's write state from an ALREADY-LOADED
// order status. The render path uses this directly: getThreadForViewer
// (lib/queries/messaging.ts) already returns orderStatus in its
// joined query, so the page does NOT issue a second DB read just to
// compute write state. `sendMessage` does NOT use this — it uses
// getWriteState() below, which re-reads fresh.
export function writeStateFor(
  thread: Pick<MessageThread, 'orderId'>,
  orderStatus: OrderStatus | null,
): ThreadWriteState {
  if (!thread.orderId) return { kind: 'open', reason: 'pre_purchase' };
  // Defensive — orderId set but no status loaded (the order row
  // vanished). Treat as closed: never accept a write on a thread
  // whose order state we can't read.
  if (!orderStatus) return { kind: 'closed', reason: 'order_terminal' };

  switch (orderStatus) {
    case 'disputed':
      return { kind: 'open', reason: 'order_disputed' };
    case 'completed':
    case 'cancelled_by_buyer':
    case 'cancelled_by_seller':
    case 'auto_cancelled':
      return { kind: 'closed', reason: 'order_terminal' };
    case 'pending_seller_response':
    case 'pending_payment_arrangement':
    case 'payment_received':
    case 'shipped':
      return { kind: 'open', reason: 'order_active' };
    default: {
      // Exhaustiveness guard — adding a new order_status without a
      // case here trips this at compile time.
      const _exhaustive: never = orderStatus;
      throw new Error(`Unhandled order status: ${String(_exhaustive)}`);
    }
  }
}

// Live write-state check — re-reads the order status from the DB.
// Used by `sendMessage`, where the status MUST be checked fresh: a
// concurrent transitionOrder could have just closed (terminal) or
// reopened (disputed) the thread between page render and send.
export async function getWriteState(thread: MessageThread): Promise<ThreadWriteState> {
  if (!thread.orderId) return { kind: 'open', reason: 'pre_purchase' };

  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, thread.orderId))
    .limit(1);
  return writeStateFor(thread, order?.status ?? null);
}

export async function isBuyerBlocked(
  artisanProfileId: string,
  buyerUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ blockedUserId: sellerBlockedBuyers.blockedUserId })
    .from(sellerBlockedBuyers)
    .where(
      and(
        eq(sellerBlockedBuyers.artisanProfileId, artisanProfileId),
        eq(sellerBlockedBuyers.blockedUserId, buyerUserId),
      ),
    )
    .limit(1);
  return !!row;
}

// Mirror of isBuyerBlocked — has the buyer blocked this artisan? Used
// in sendMessage to reject a seller's reply on a pre-purchase thread
// when the buyer has blocked them. Order-anchored threads are
// unaffected (block is messaging-only, same stance as seller-block).
export async function isSellerBlocked(
  buyerUserId: string,
  artisanProfileId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ buyerUserId: buyerBlockedSellers.buyerUserId })
    .from(buyerBlockedSellers)
    .where(
      and(
        eq(buyerBlockedSellers.buyerUserId, buyerUserId),
        eq(buyerBlockedSellers.blockedArtisanProfileId, artisanProfileId),
      ),
    )
    .limit(1);
  return !!row;
}

// Both block directions, fetched in parallel. The two underlying helpers
// take their two ID arguments in OPPOSITE orders — every paired call
// site previously had to remember which goes where, twice. This wrapper
// is the one source of truth for "is the buyer↔seller relationship
// paused on either side?", used by both server actions and both thread
// pages.
export async function getBlockState(
  buyerUserId: string,
  artisanProfileId: string,
): Promise<{ buyerBlockedSeller: boolean; sellerBlockedBuyer: boolean }> {
  const [sellerBlockedBuyer, buyerBlockedSeller] = await Promise.all([
    isBuyerBlocked(artisanProfileId, buyerUserId),
    isSellerBlocked(buyerUserId, artisanProfileId),
  ]);
  return { buyerBlockedSeller, sellerBlockedBuyer };
}
