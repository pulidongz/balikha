import { and, eq, isNull, sql, type InferInsertModel } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { logger } from '@/lib/logger';

type NotificationInsert = InferInsertModel<typeof notifications>;

/**
 * Standalone notification emit (NOT inside an existing transaction).
 *
 * Use only for "after-the-fact" triggers where the originating mutation
 * has already committed. For triggers that must roll back with the
 * originating mutation (e.g. publish + new-listing notifications), the
 * caller should `tx.insert(notifications).values(...)` directly inside
 * its own transaction — that pattern lives in lib/actions/product.ts.
 *
 * Errors are logged and swallowed: a notification fan-out failure should
 * NEVER bubble up to break the user-facing response. The caller has
 * already succeeded by the time this runs.
 */
export async function emitNotifications(
  items: Array<Omit<NotificationInsert, 'id' | 'createdAt' | 'readAt'>>,
): Promise<void> {
  if (items.length === 0) return;
  try {
    await db.insert(notifications).values(items);
  } catch (e) {
    logger.error({ err: e, count: items.length }, 'emitNotifications failed');
  }
}

/**
 * Emit unless an UNREAD notification with the same (user, type, target.id)
 * already exists — the toggle-spam guard for T10's traction signals
 * (follow/unfollow/follow must not stack rows the artist clears one by
 * one). Mirrors the new_message one-unread-per-thread behavior, but
 * app-level: target is jsonb, so the messages-style partial unique index
 * isn't available. The check-then-insert race is acceptable — the loser
 * adds one duplicate row, never breaks the action.
 *
 * Same error contract as emitNotifications: log and continue, never
 * bubble into the already-committed user action.
 */
export async function emitDedupedNotification(
  item: Omit<NotificationInsert, 'id' | 'createdAt' | 'readAt'> & {
    target: { kind: string; id: string; url?: string };
  },
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, item.userId),
          eq(notifications.type, item.type),
          isNull(notifications.readAt),
          sql`${notifications.target}->>'id' = ${item.target.id}`,
        ),
      )
      .limit(1);
    if (existing) return;
    await db.insert(notifications).values(item);
  } catch (e) {
    logger.error({ err: e, type: item.type }, 'emitDedupedNotification failed');
  }
}
