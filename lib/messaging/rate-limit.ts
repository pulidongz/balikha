import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { messages, messageThreads } from '@/db/schema';
import { env } from '@/env';

// Pre-purchase threads this buyer has STARTED in the last 24h. The
// limit is shared across artisans by design — a buyer who's already
// started 1 new pre-thread today can't open one with a different
// artisan either. Mass-DM scenarios get a 24h wait.
export async function isAtNewThreadLimit(buyerUserId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(messageThreads)
    .where(
      and(
        eq(messageThreads.buyerUserId, buyerUserId),
        isNull(messageThreads.orderId),
        gte(messageThreads.createdAt, cutoff),
      ),
    );
  return (row?.value ?? 0) >= env.MESSAGING_NEW_THREADS_PER_BUYER_PER_24H;
}

// Total messages this user has sent in the rolling 24h window. Same
// limit applies to sellers (a high-volume seller responding to
// many buyers can hit this — tune via env if observed in production).
export async function isAtDailyMessageLimit(senderUserId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(messages)
    .where(and(eq(messages.senderUserId, senderUserId), gte(messages.createdAt, cutoff)));
  return (row?.value ?? 0) >= env.MESSAGING_MAX_MESSAGES_PER_USER_PER_DAY;
}

// Messages this sender has sent on THIS thread in the last 60s. Burst
// limit catches rapid-fire spam within a single conversation.
export async function isAtThreadBurstLimit(
  senderUserId: string,
  threadId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.senderUserId, senderUserId),
        eq(messages.threadId, threadId),
        gte(messages.createdAt, cutoff),
      ),
    );
  return (row?.value ?? 0) >= env.MESSAGING_MAX_MESSAGES_PER_THREAD_PER_MINUTE;
}
