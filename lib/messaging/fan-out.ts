import { eq } from 'drizzle-orm';
import type { Tx } from '@/db';
import { artisanProfiles, notifications } from '@/db/schema';
import { getRequestLogger } from '@/lib/logger-context';
import type { MessageSenderRole, MessageThread } from './types';

const PREVIEW_MAX_CHARS = 120;

// Inserts a new_message notification for the recipient OR no-ops if
// the recipient already has an unread one for this thread. The
// no-op path is enforced by the partial unique index
// notifications_user_thread_unread_idx + ON CONFLICT DO NOTHING —
// no application-level check needed.
//
// Atomicity: the caller (sendMessage / createPrePurchaseThread)
// passes its transaction in, so a fan-out failure rolls back the
// message insert. Same stance as fanOutTransitionNotification in
// lib/actions/orders.ts.
export async function fanOutMessageNotification(
  tx: Tx,
  thread: MessageThread,
  senderRole: MessageSenderRole,
  message: { body: string },
): Promise<void> {
  // Recipient is the other party.
  let recipientUserId: string;
  let recipientUrl: string;
  let title: string;

  if (senderRole === 'buyer') {
    const [artisan] = await tx
      .select({ userId: artisanProfiles.userId })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.id, thread.artisanProfileId))
      .limit(1);
    // If the seller account vanished mid-transaction the message is
    // still valuable to the buyer, but there's no one to notify — skip
    // (don't roll back the message). Leave a log trace so the silent
    // path is observable if it ever fires for a non-deletion reason.
    if (!artisan) {
      const log = await getRequestLogger();
      log.warn(
        { threadId: thread.id, artisanProfileId: thread.artisanProfileId },
        'fanOutMessageNotification: seller artisan profile missing — message committed without notification',
      );
      return;
    }
    recipientUserId = artisan.userId;
    recipientUrl = thread.orderId
      ? `/dashboard/orders/${thread.orderId}`
      : `/dashboard/messages/${thread.id}`;
    title = `New message about ${thread.productTitleSnapshot}`;
  } else {
    recipientUserId = thread.buyerUserId;
    recipientUrl = thread.orderId
      ? `/account/orders/${thread.orderId}`
      : `/account/messages/${thread.id}`;
    title = `${thread.artisanShopNameSnapshot} replied`;
  }

  // Truncate so the notification table stays compact and the
  // notification's own preview line is bounded. (The Messages inbox
  // preview is a separate concern: it reads messages.body directly via
  // inboxQuery, which applies its own left(...) truncation — see §5.1.)
  const preview =
    message.body.length > PREVIEW_MAX_CHARS
      ? `${message.body.slice(0, PREVIEW_MAX_CHARS - 1)}…`
      : message.body;

  await tx
    .insert(notifications)
    .values({
      userId: recipientUserId,
      type: 'new_message',
      title,
      body: preview,
      threadId: thread.id,
      target: {
        kind: 'thread',
        id: thread.id,
        url: recipientUrl,
      },
    })
    .onConflictDoNothing();
}
