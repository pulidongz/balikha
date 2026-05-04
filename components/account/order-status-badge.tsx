import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type OrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

const LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const VARIANT_CLASS: Record<OrderStatus, string> = {
  pending_payment: 'border-transparent bg-[var(--gold)] text-foreground',
  paid: 'border-transparent bg-secondary text-foreground',
  shipped: 'border-transparent bg-secondary text-foreground',
  delivered: 'border-transparent bg-foreground text-background',
  cancelled: 'border-transparent bg-muted text-muted-foreground',
  refunded: 'border-transparent bg-muted text-muted-foreground',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={cn('tracking-wide uppercase', VARIANT_CLASS[status])}>{LABEL[status]}</Badge>
  );
}
