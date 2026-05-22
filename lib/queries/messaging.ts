import { and, count, desc, eq, exists, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanProfiles,
  messageReports,
  messageThreads,
  messages,
  notifications,
  orders,
  user,
} from '@/db/schema';
import type { OrderStatus } from '@/lib/orders/types';
import type { MessageSenderRole, MessageThread } from '@/lib/messaging/types';

// =============================================================================
// Single thread — render-path loaders
// =============================================================================

// One joined row: thread + the seller's userId (for role derivation)
// + buyer display name + order status/reference. Shared by the
// participant loader and the admin loader below — one query replaces
// a separate access-check + separate thread-load two-step (~5 queries)
// on the render path.
async function loadThreadRow(threadId: string) {
  const [row] = await db
    .select({
      thread: messageThreads,
      sellerUserId: artisanProfiles.userId,
      buyerName: user.name,
      orderStatus: orders.status,
      orderReference: orders.reference,
    })
    .from(messageThreads)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, messageThreads.artisanProfileId))
    .innerJoin(user, eq(user.id, messageThreads.buyerUserId))
    .leftJoin(orders, eq(orders.id, messageThreads.orderId))
    .where(eq(messageThreads.id, threadId))
    .limit(1);
  return row ?? null;
}

export interface MessageWithSender {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: Date;
  seq: number;
  senderName: string;
}

// Message list for a thread, ordered by the monotonic `seq` so the
// render order is deterministic even for same-tick inserts.
export async function getMessagesForThread(threadId: string): Promise<MessageWithSender[]> {
  return db
    .select({
      id: messages.id,
      threadId: messages.threadId,
      senderUserId: messages.senderUserId,
      senderRole: messages.senderRole,
      body: messages.body,
      createdAt: messages.createdAt,
      seq: messages.seq,
      senderName: user.name,
    })
    .from(messages)
    .innerJoin(user, eq(user.id, messages.senderUserId))
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.seq);
}

export interface ThreadForViewer {
  thread: MessageThread;
  role: MessageSenderRole;
  counterpartyName: string;
  orderStatus: OrderStatus | null;
  orderReference: string | null;
}

/**
 * Render-path loader for a thread participant. ONE joined query does
 * the load AND the authorization: it returns null when the viewer is
 * neither the buyer nor the thread's seller — the page treats null as
 * notFound() (IDOR-safe, same "privacy over 403" stance as the order
 * detail pages). One query replaces a separate access check + a
 * separate thread load on the render path. `assertThreadAccess`
 * (lib/messaging/access.ts) stays for the server actions, which need
 * only a lightweight auth check, not the full render payload.
 */
export async function getThreadForViewer(
  threadId: string,
  viewerUserId: string,
): Promise<ThreadForViewer | null> {
  const row = await loadThreadRow(threadId);
  if (!row) return null;

  let role: MessageSenderRole;
  if (row.thread.buyerUserId === viewerUserId) {
    role = 'buyer';
  } else if (row.sellerUserId === viewerUserId) {
    role = 'seller';
  } else {
    return null; // not a participant
  }

  return {
    thread: row.thread,
    role,
    counterpartyName: role === 'buyer' ? row.thread.artisanShopNameSnapshot : row.buyerName,
    orderStatus: row.orderStatus,
    orderReference: row.orderReference,
  };
}

export interface ThreadForAdmin {
  thread: MessageThread;
  buyerName: string;
  orderStatus: OrderStatus | null;
  orderReference: string | null;
}

/**
 * Admin-path loader. The admin is NOT a thread participant, so
 * getThreadForViewer would return null for them. This loads the
 * thread unconditionally — used ONLY by the two sanctioned admin
 * entry points (a reported message, a disputed order). No role.
 */
export async function getThreadForAdmin(threadId: string): Promise<ThreadForAdmin | null> {
  const row = await loadThreadRow(threadId);
  if (!row) return null;
  return {
    thread: row.thread,
    buyerName: row.buyerName,
    orderStatus: row.orderStatus,
    orderReference: row.orderReference,
  };
}

// =============================================================================
// Inbox queries (LATERAL last-message join)
// =============================================================================

export interface InboxThreadRow {
  threadId: string;
  productTitleSnapshot: string;
  artisanShopNameSnapshot: string;
  buyerName: string;
  orderId: string | null;
  orderReference: string | null;
  orderStatus: OrderStatus | null;
  lastMessageBody: string | null;
  lastMessageSenderRole: MessageSenderRole | null;
  lastMessageAt: Date | null;
  unread: boolean;
  updatedAt: Date;
}

const PAGE_SIZE = 50;

// Inbox query — most-recent-message-per-thread via Drizzle's native
// `leftJoinLateral` (present in Drizzle 0.45). No raw SQL: table
// identifiers come from the imported schema objects so a typo like
// `users` vs `user` is structurally impossible, and the result row
// is fully type-inferred (no hand-written shape to drift).
//
// `unread` is a correlated EXISTS against the partial unique index
// notifications_user_thread_unread_idx. It is an index scan with a
// heap recheck on `type`: the index covers (user_id, thread_id) plus
// the `read_at IS NULL` partial predicate, but NOT `type`. The
// explicit `type = 'new_message'` filter is kept deliberately — it is
// redundant today (thread_id is exclusive to new_message rows, §3.3)
// but invariant-independent, so the query stays correct if a future
// notification type ever gains a thread_id.
async function inboxQuery(opts: {
  side: 'buyer' | 'seller';
  viewerKey: { buyerUserId: string } | { artisanProfileId: string };
  viewerUserId: string;
}): Promise<InboxThreadRow[]> {
  const whereClause =
    opts.side === 'buyer'
      ? eq(messageThreads.buyerUserId, (opts.viewerKey as { buyerUserId: string }).buyerUserId)
      : eq(
          messageThreads.artisanProfileId,
          (opts.viewerKey as { artisanProfileId: string }).artisanProfileId,
        );

  // Correlated LATERAL subquery: the most-recent message per thread.
  // Ordered by `seq` (monotonic) so "most recent" is deterministic.
  // The subquery references the outer messageThreads.id — Postgres
  // resolves it via the LATERAL join.
  const lastMessage = db
    .select({
      // Truncated at the data layer (round-2 review Issue 17): the
      // inbox renders this in a single CSS-truncated line, so shipping
      // the full body (up to 2000 chars) × PAGE_SIZE rows of HTML is
      // waste. 200 chars is far more than one line ever displays.
      //
      // `.as('body')` is REQUIRED: this is a raw SQL field inside a
      // subquery referenced via leftJoinLateral. Drizzle infers aliases
      // for real columns but raw `sql` fragments need the alias spelled
      // out so the outer `lastMessage.body` reference can resolve. Real
      // columns below (senderRole, createdAt) don't need it.
      body: sql<string>`left(${messages.body}, 200)`.as('body'),
      senderRole: messages.senderRole,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.threadId, messageThreads.id))
    .orderBy(desc(messages.seq))
    .limit(1)
    .as('last_message');

  // The selected shape matches InboxThreadRow exactly, so the builder
  // result is returned directly — no `.map()` re-shaping, no casts.
  return (
    db
      .select({
        threadId: messageThreads.id,
        productTitleSnapshot: messageThreads.productTitleSnapshot,
        artisanShopNameSnapshot: messageThreads.artisanShopNameSnapshot,
        buyerName: user.name,
        orderId: messageThreads.orderId,
        orderReference: orders.reference,
        orderStatus: orders.status,
        lastMessageBody: lastMessage.body,
        lastMessageSenderRole: lastMessage.senderRole,
        lastMessageAt: lastMessage.createdAt,
        // exists() is typed SQL<unknown>; mapWith(Boolean) coerces the
        // EXISTS result to a typed boolean so the row matches InboxThreadRow.
        unread: exists(
          db
            .select({ one: sql`1` })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, opts.viewerUserId),
                eq(notifications.threadId, messageThreads.id),
                eq(notifications.type, 'new_message'),
                isNull(notifications.readAt),
              ),
            ),
        ).mapWith(Boolean),
        updatedAt: messageThreads.updatedAt,
      })
      .from(messageThreads)
      .innerJoin(user, eq(user.id, messageThreads.buyerUserId))
      .leftJoin(orders, eq(orders.id, messageThreads.orderId))
      .leftJoinLateral(lastMessage, sql`true`)
      .where(whereClause)
      // `messageThreads.id` (a unique UUID) is a deterministic tie-break
      // so two threads bumped within the same millisecond sort stably
      // across renders — updatedAt alone (JS `new Date()`, ms resolution)
      // can collide, same hazard `messages.seq` solves one level down.
      .orderBy(desc(messageThreads.updatedAt), desc(messageThreads.id))
      .limit(PAGE_SIZE)
  );
}

export function getInboxForBuyer(buyerUserId: string): Promise<InboxThreadRow[]> {
  return inboxQuery({
    side: 'buyer',
    viewerKey: { buyerUserId },
    viewerUserId: buyerUserId,
  });
}

export async function getInboxForSeller(
  artisanProfileId: string,
  viewerUserId: string,
): Promise<InboxThreadRow[]> {
  return inboxQuery({
    side: 'seller',
    viewerKey: { artisanProfileId },
    viewerUserId,
  });
}

// =============================================================================
// Unread counts for sidebar badges (per side)
// =============================================================================

// The Messages badge in each layout (/account vs /dashboard) shows the
// unread count for the threads THAT SURFACE will display. A single user
// can be both buyer (in some threads) and seller (in others, if they
// have an artisan profile); without per-side scoping, the buyer-account
// badge would say "1" when the only unread is on the user's seller
// dashboard inbox — and clicking it leads to an empty page. These two
// helpers join through message_threads so the count matches what each
// inbox will actually render.

export async function getUnreadBuyerMessagesCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .innerJoin(messageThreads, eq(messageThreads.id, notifications.threadId))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'new_message'),
        isNull(notifications.readAt),
        eq(messageThreads.buyerUserId, userId),
      ),
    );
  return row?.value ?? 0;
}

export async function getUnreadSellerMessagesCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .innerJoin(messageThreads, eq(messageThreads.id, notifications.threadId))
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, messageThreads.artisanProfileId))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'new_message'),
        isNull(notifications.readAt),
        eq(artisanProfiles.userId, userId),
      ),
    );
  return row?.value ?? 0;
}

// =============================================================================
// Admin reports queue
// =============================================================================

export async function getOpenReportsCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(messageReports)
    .where(eq(messageReports.status, 'open'));
  return row?.value ?? 0;
}

export interface OpenReportRow {
  reportId: string;
  messageId: string;
  threadId: string;
  reporterName: string;
  reason: string | null;
  createdAt: Date;
  messageBody: string;
  messageSenderRole: 'buyer' | 'seller';
}

export async function getOpenReports(limit = 50): Promise<OpenReportRow[]> {
  return db
    .select({
      reportId: messageReports.id,
      messageId: messageReports.messageId,
      threadId: messages.threadId,
      reporterName: user.name,
      reason: messageReports.reason,
      createdAt: messageReports.createdAt,
      messageBody: messages.body,
      messageSenderRole: messages.senderRole,
    })
    .from(messageReports)
    .innerJoin(messages, eq(messages.id, messageReports.messageId))
    .innerJoin(user, eq(user.id, messageReports.reporterUserId))
    .where(eq(messageReports.status, 'open'))
    .orderBy(desc(messageReports.createdAt))
    .limit(limit);
}
