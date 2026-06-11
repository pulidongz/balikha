import { count, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { adminActions, user } from '@/db/schema';

export const ADMIN_AUDIT_LOG_PAGE_SIZE = 50;

export async function getAdminAuditLog(page: number) {
  const offset = (page - 1) * ADMIN_AUDIT_LOG_PAGE_SIZE;

  const [list, totalRow] = await Promise.all([
    db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        reason: adminActions.reason,
        createdAt: adminActions.createdAt,
        actorId: adminActions.actorUserId,
        targetId: adminActions.targetUserId,
      })
      .from(adminActions)
      .orderBy(desc(adminActions.createdAt))
      .limit(ADMIN_AUDIT_LOG_PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(adminActions),
  ]);

  // Collect all referenced user ids and resolve names + emails in one query.
  const allUserIds = Array.from(
    new Set(list.flatMap((r) => [r.actorId, r.targetId]).filter((id): id is string => id !== null)),
  );

  const usersById = new Map<string, { name: string; email: string }>();
  if (allUserIds.length > 0) {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, allUserIds));
    for (const u of users) {
      usersById.set(u.id, { name: u.name, email: u.email });
    }
  }

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_AUDIT_LOG_PAGE_SIZE));

  return { list, total, totalPages, usersById };
}
