import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';

// Direct Drizzle query (Issue 9 — avoids the plugin listUsers empty-list
// error-swallow and gives control over every column including banExpires).
export const ADMIN_USERS_PAGE_SIZE = 50;

export type AdminUserRoleFilter = 'all' | 'user' | 'admin';
export type AdminUserStatusFilter = 'all' | 'active' | 'suspended' | 'banned';

export function parseUserRoleFilter(raw: string | string[] | undefined): AdminUserRoleFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'user' || value === 'admin' ? value : 'all';
}

export function parseUserStatusFilter(raw: string | string[] | undefined): AdminUserStatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'active' || value === 'suspended' || value === 'banned' ? value : 'all';
}

// SQL mirror of deriveStatus(): active = not banned; suspended = banned with a
// future expiry; banned = banned with no/elapsed expiry. Keep in lockstep with
// lib/admin/user-status.ts so the filter and the rendered pill never disagree.
function statusCondition(
  status: Exclude<AdminUserStatusFilter, 'all'>,
  now: Date,
): SQL | undefined {
  switch (status) {
    case 'active':
      return or(eq(user.banned, false), isNull(user.banned));
    case 'suspended':
      return and(eq(user.banned, true), isNotNull(user.banExpires), gt(user.banExpires, now));
    case 'banned':
      return and(eq(user.banned, true), or(isNull(user.banExpires), lte(user.banExpires, now)));
  }
}

export async function getAdminUsers({
  search,
  page,
  role,
  status,
  now,
}: {
  search: string;
  page: number;
  role: AdminUserRoleFilter;
  status: AdminUserStatusFilter;
  now: Date;
}) {
  const offset = (page - 1) * ADMIN_USERS_PAGE_SIZE;

  const conditions: SQL[] = [];
  if (search.length > 0) {
    const searchCondition = or(
      ilike(user.email, `%${search}%`),
      ilike(user.name, `%${search}%`),
      ilike(user.firstName, `%${search}%`),
      ilike(user.lastName, `%${search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (role !== 'all') conditions.push(eq(user.role, role));
  if (status !== 'all') {
    const sc = statusCondition(status, now);
    if (sc) conditions.push(sc);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

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
      .where(where)
      .orderBy(desc(user.createdAt), asc(user.id))
      .limit(ADMIN_USERS_PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(user).where(where),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));

  return { list, total, totalPages };
}
