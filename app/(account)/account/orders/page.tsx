import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import {
  BuyerOrderListFilters,
  type BuyerOrderListFilter,
} from '@/components/account/buyer-order-list-filters';
import { OrderRow } from '@/components/account/order-row';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Orders',
};

const PAGE_SIZE = 50;

// Map filter → status set. Mirror of the seller's filter mapping but
// without 'pending_response' (buyers don't get a separate "awaiting"
// view — that whole pre-shipment span is what 'in_progress' covers).
function statusesForFilter(filter: BuyerOrderListFilter): readonly string[] | null {
  switch (filter) {
    case 'all':
      return null;
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
    case 'disputed':
      return ['disputed'];
  }
}

function parseFilter(raw: string | string[] | undefined): BuyerOrderListFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch (value) {
    case 'all':
    case 'completed':
    case 'cancelled':
    case 'disputed':
      return value;
    case 'in_progress':
    case undefined:
    default:
      return 'in_progress';
  }
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/orders');

  const params = await searchParams;
  const filter = parseFilter(params.status);
  const statuses = statusesForFilter(filter);

  const whereClauses: SQL[] = [eq(orders.buyerUserId, current.id)];
  if (statuses) {
    whereClauses.push(inArray(orders.status, statuses as readonly (typeof orders.status._.data)[]));
  }

  const list = await db
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
    .where(and(...whereClauses))
    .orderBy(desc(orders.placedAt))
    .limit(PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Orders</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {list.length === 0
            ? 'No orders match this filter.'
            : `${list.length} ${list.length === 1 ? 'order' : 'orders'}`}
        </p>
      </header>

      <BuyerOrderListFilters />

      {list.length === 0 ? (
        <EmptyState
          title={filter === 'in_progress' ? 'No orders in progress' : 'No orders match this filter'}
          description={
            filter === 'in_progress'
              ? "When you place an order, it'll appear here while you and the seller coordinate."
              : 'Try a different filter from the tabs above.'
          }
          action={
            filter === 'in_progress' ? (
              <Link href="/" className={buttonVariants({ variant: 'outline' })}>
                Browse the marketplace
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}
