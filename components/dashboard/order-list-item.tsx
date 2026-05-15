import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import type { OrderStatus } from '@/lib/orders/types';

interface SellerOrderRow {
  id: string;
  reference: string;
  status: OrderStatus;
  productTitleSnapshot: string;
  priceSnapshot: string;
  currency: string;
  placedAt: Date;
  recipientName: string;
}

export function OrderListItem({ order }: { order: SellerOrderRow }) {
  const needsAttention = order.status === 'pending_seller_response';
  return (
    <li>
      <Link
        href={`/dashboard/orders/${order.id}`}
        className={cn(
          'bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-md border p-4 transition-colors sm:flex-row sm:items-center sm:gap-6',
          needsAttention && 'border-l-accent border-l-4',
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-sm">{order.reference}</p>
          <p className="text-foreground truncate text-sm">{order.productTitleSnapshot}</p>
          <p className="text-muted-foreground text-xs">
            {formatRelativeTime(order.placedAt)} · ship to {order.recipientName}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {formatPrice(order.priceSnapshot, order.currency)}
        </p>
      </Link>
    </li>
  );
}
