import { asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';

// Direct Drizzle query (Issue 9 — avoids the plugin listUsers empty-list
// error-swallow and gives control over every column including banExpires).
export const ADMIN_USERS_PAGE_SIZE = 50;

export async function getAdminUsers({ search, page }: { search: string; page: number }) {
  const offset = (page - 1) * ADMIN_USERS_PAGE_SIZE;

  const searchCondition =
    search.length > 0
      ? or(
          ilike(user.email, `%${search}%`),
          ilike(user.name, `%${search}%`),
          ilike(user.firstName, `%${search}%`),
          ilike(user.lastName, `%${search}%`),
        )
      : undefined;

  const [list, totalRow] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        isArtisan: artisanProfiles.id,
      })
      .from(user)
      .leftJoin(artisanProfiles, eq(artisanProfiles.userId, user.id))
      .where(searchCondition)
      .orderBy(desc(user.createdAt), asc(user.id))
      .limit(ADMIN_USERS_PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(user).where(searchCondition),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));

  return { list, total, totalPages };
}
