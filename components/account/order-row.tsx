import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders/types';
import { OrderStatusBadge } from './order-status-badge';

interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  productTitleSnapshot: string;
  priceSnapshot: string;
  currency: string;
  placedAt: Date;
}

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function OrderRow({ order }: { order: Order }) {
  return (
    <li>
      <Link
        href={`/account/orders/${order.id}`}
        className="bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-md border p-4 transition-colors sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-sm">{order.reference}</p>
          <p className="text-muted-foreground truncate text-xs">
            {DATE_FMT.format(order.placedAt)} · {order.productTitleSnapshot}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
        <p className="text-sm font-medium tabular-nums">
          {formatPrice(order.priceSnapshot, order.currency)}
        </p>
      </Link>
    </li>
  );
}
