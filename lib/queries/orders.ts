import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';

// Seller-side pending-response count for the dashboard sidebar badge.
// Hits the (artisan_profile_id, status) composite index from Phase 1.
// COUNT(*) returns a string from postgres-js; the explicit ::int via
// count() Drizzle helper normalizes to number.
export async function getPendingOrdersCount(artisanProfileId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(orders)
    .where(
      and(
        eq(orders.artisanProfileId, artisanProfileId),
        eq(orders.status, 'pending_seller_response'),
      ),
    );
  return row?.value ?? 0;
}
