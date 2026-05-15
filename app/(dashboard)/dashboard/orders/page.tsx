import Link from 'next/link';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { EmptyState } from '@/components/marketplace/empty-state';
import { OrderListFilters, type OrderListFilter } from '@/components/dashboard/order-list-filters';
import { OrderListItem } from '@/components/dashboard/order-list-item';
import { getPendingOrdersCount } from '@/lib/queries/orders';

export const metadata = {
  title: 'Orders',
};

const PAGE_SIZE = 50;

type ShippingSnapshot = { recipientName?: string } | null;

// Map filter value → status set. Kept here (not in the client filter
// component) so the server is the source of truth and the URL state
// can be debugged by hand. 'all' returns null = no status predicate.
function statusesForFilter(filter: OrderListFilter): readonly string[] | null {
  switch (filter) {
    case 'all':
      return null;
    case 'pending_response':
      return ['pending_seller_response'];
    case 'active':
      return ['pending_payment_arrangement', 'payment_received', 'shipped'];
    case 'completed':
      return ['completed'];
    case 'cancelled':
      return ['cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled'];
    case 'disputed':
      return ['disputed'];
  }
}

function parseFilter(raw: string | string[] | undefined): OrderListFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch (value) {
    case 'pending_response':
    case 'active':
    case 'completed':
    case 'cancelled':
    case 'disputed':
      return value;
    default:
      return 'all';
  }
}

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const profile = await requireSellerProfile();
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const statuses = statusesForFilter(filter);

  // Fetch list + pending count in parallel. Pending count is also used
  // in the layout sidebar but re-deriving here keeps the filter bar's
  // badge in sync with the page render — no chance of drift between
  // a stale layout fetch and an updated list.
  const whereClauses: SQL[] = [eq(orders.artisanProfileId, profile.id)];
  if (statuses) {
    whereClauses.push(
      // Type-safe inArray over the seller orderStatus enum subset
      inArray(orders.status, statuses as readonly (typeof orders.status._.data)[]),
    );
  }

  const [list, pendingCount] = await Promise.all([
    db
      .select({
        id: orders.id,
        reference: orders.reference,
        status: orders.status,
        productTitleSnapshot: orders.productTitleSnapshot,
        priceSnapshot: orders.priceSnapshot,
        currency: orders.currency,
        placedAt: orders.placedAt,
        shippingAddressJson: orders.shippingAddressJson,
      })
      .from(orders)
      .where(and(...whereClauses))
      .orderBy(desc(orders.placedAt))
      .limit(PAGE_SIZE),
    getPendingOrdersCount(profile.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="font-serif text-3xl tracking-tight">Orders</h1>
        <p className="text-muted-foreground">
          Manage incoming orders from buyers. New orders await your response.
        </p>
      </header>

      <OrderListFilters pendingCount={pendingCount} />

      {list.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No orders yet' : 'No orders match this filter'}
          description={
            filter === 'all'
              ? 'When buyers place orders for your work, they appear here for your response.'
              : 'Try a different filter from the tabs above.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OrderListItem
              key={o.id}
              order={{
                id: o.id,
                reference: o.reference,
                status: o.status,
                productTitleSnapshot: o.productTitleSnapshot,
                priceSnapshot: o.priceSnapshot,
                currency: o.currency,
                placedAt: o.placedAt,
                recipientName: (o.shippingAddressJson as ShippingSnapshot)?.recipientName ?? '—',
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
