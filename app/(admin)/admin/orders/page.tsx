import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-helpers';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import {
  type AdminOrderFilter,
  getAdminOrders,
  parseOrderFilter,
} from '@/lib/queries/admin-orders';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Orders — Admin',
};

const TABS: readonly { value: AdminOrderFilter; label: string }[] = [
  { value: 'disputed', label: 'Disputed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = parseOrderFilter(params.status);

  const { list, disputedCount } = await getAdminOrders(filter);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Orders</h1>
        <p className="text-muted-foreground text-sm">
          Marketplace-wide order management. Disputed orders are the priority queue.
        </p>
      </header>

      <nav aria-label="Order filters" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            const showBadge = tab.value === 'disputed' && disputedCount > 0;
            const href =
              tab.value === 'disputed' ? '/admin/orders' : `/admin/orders?status=${tab.value}`;
            return (
              <li key={tab.value}>
                <Link
                  href={href}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'text-foreground border-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  <span>{tab.label}</span>
                  {showBadge && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums',
                        active
                          ? 'bg-foreground text-background'
                          : 'bg-destructive text-destructive-foreground',
                      )}
                    >
                      {disputedCount > 99 ? '99+' : disputedCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          No orders match this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className={cn(
                  'bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-md border p-3 transition-colors sm:flex-row sm:items-center sm:gap-6',
                  o.status === 'disputed' && 'border-destructive/40 bg-destructive/5',
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-mono text-sm">{o.reference}</p>
                  <p className="text-foreground truncate text-sm">{o.productTitleSnapshot}</p>
                  <p className="text-muted-foreground text-xs">
                    Placed {formatRelativeTime(o.placedAt)}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
                <p className="shrink-0 text-sm tabular-nums">
                  {formatPrice(o.priceSnapshot, o.currency)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
