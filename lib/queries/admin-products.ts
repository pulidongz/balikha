import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';
import { firstParam } from './admin-params';

export const ADMIN_PRODUCTS_PAGE_SIZE = 50;

export type AdminProductFilter = 'all' | 'live' | 'flagged' | 'removed';

export function parseProductFilter(raw: string | string[] | undefined): AdminProductFilter {
  const value = firstParam(raw);
  switch (value) {
    case 'all':
    case 'live':
    case 'flagged':
    case 'removed':
      return value;
    default:
      return 'all';
  }
}

export async function getAdminProducts({
  search,
  filter,
  page,
}: {
  search: string;
  filter: AdminProductFilter;
  page: number;
}) {
  const offset = (page - 1) * ADMIN_PRODUCTS_PAGE_SIZE;

  const whereClauses: SQL[] = [];

  if (search.length > 0) {
    whereClauses.push(ilike(products.title, `%${search}%`));
  }

  switch (filter) {
    case 'all':
      break;
    case 'live':
      whereClauses.push(eq(products.status, 'published'));
      break;
    case 'flagged':
      whereClauses.push(eq(products.moderationStatus, 'flagged'));
      break;
    case 'removed':
      whereClauses.push(eq(products.moderationStatus, 'removed'));
      break;
  }

  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [list, totalRow] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        status: products.status,
        moderationStatus: products.moderationStatus,
        createdAt: products.createdAt,
        shopName: artisanProfiles.shopName,
        artisanSlug: artisanProfiles.shopSlug,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(whereExpr)
      .orderBy(desc(products.createdAt))
      .limit(ADMIN_PRODUCTS_PAGE_SIZE)
      .offset(offset),
    db
      .select({ value: count() })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(whereExpr),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PRODUCTS_PAGE_SIZE));

  return { list, total, totalPages };
}
