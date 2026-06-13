import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, orders, user } from '@/db/schema';
import { firstParam } from './admin-params';

export const ADMIN_ORDERS_PAGE_SIZE = 100;

export type AdminOrderFilter = 'all' | 'disputed' | 'in_progress' | 'completed' | 'cancelled';

export function parseOrderFilter(raw: string | string[] | undefined): AdminOrderFilter {
  const value = firstParam(raw);
  switch (value) {
    case 'all':
    case 'in_progress':
    case 'completed':
    case 'cancelled':
      return value;
    case 'disputed':
    case undefined:
    default:
      return 'disputed';
  }
}

function statusesForFilter(filter: AdminOrderFilter): readonly string[] | null {
  switch (filter) {
    case 'all':
      return null;
    case 'disputed':
      return ['disputed'];
    case 'in_progress':
      return [
        'pending_seller_response',
        'pending_payment_arrangement',
        'payment_received',
        'shipped',
      ];
    case 'completed':
      return ['completed'];
    case 'cancelled':
      return ['cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled'];
  }
}

export async function getAdminOrders({
  filter,
  search,
}: {
  filter: AdminOrderFilter;
  search: string;
}) {
  const statuses = statusesForFilter(filter);

  const whereClauses: SQL[] = [];
  if (statuses) {
    whereClauses.push(inArray(orders.status, statuses as readonly (typeof orders.status._.data)[]));
  }
  if (search) {
    const like = `%${search}%`;
    // Reference, product title, buyer email, or studio name — the four ways an
    // admin looks an order up (support email, "where's my X", seller report).
    const term = or(
      ilike(orders.reference, like),
      ilike(orders.productTitleSnapshot, like),
      ilike(user.email, like),
      ilike(artisanProfiles.shopName, like),
    );
    if (term) whereClauses.push(term);
  }

  const [list, disputedCountRow] = await Promise.all([
    db
      .select({
        id: orders.id,
        reference: orders.reference,
        status: orders.status,
        productTitleSnapshot: orders.productTitleSnapshot,
        priceSnapshot: orders.priceSnapshot,
        currency: orders.currency,
        placedAt: orders.placedAt,
      })
      .from(orders)
      // leftJoin so an order whose buyer or artisan row was deleted still
      // appears; the joins only widen the searchable columns.
      .leftJoin(user, eq(user.id, orders.buyerUserId))
      .leftJoin(artisanProfiles, eq(artisanProfiles.id, orders.artisanProfileId))
      .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
      .orderBy(desc(orders.placedAt))
      .limit(ADMIN_ORDERS_PAGE_SIZE),
    db.select({ value: count() }).from(orders).where(eq(orders.status, 'disputed')),
  ]);

  return { list, disputedCount: disputedCountRow[0]?.value ?? 0 };
}
