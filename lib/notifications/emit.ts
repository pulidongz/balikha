import type { InferInsertModel } from 'drizzle-orm';
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
