import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/orders/types';

const LABEL: Record<OrderStatus, string> = {
  pending_seller_response: 'Awaiting artist',
  pending_payment_arrangement: 'Arranging payment',
  payment_received: 'Payment received',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled_by_buyer: 'Cancelled by buyer',
  cancelled_by_seller: 'Cancelled by artist',
  auto_cancelled: 'Auto-cancelled',
  disputed: 'Disputed',
};

const VARIANT_CLASS: Record<OrderStatus, string> = {
  // Awaiting the artist — a pending state that needs action; Burnt Amber.
  pending_seller_response: 'border-transparent bg-warning text-warning-foreground',
  // Active states — neutral/in-progress visuals
  pending_payment_arrangement: 'border-transparent bg-secondary text-foreground',
  payment_received: 'border-transparent bg-secondary text-foreground',
  shipped: 'border-transparent bg-secondary text-foreground',
  // Terminal success
  completed: 'border-transparent bg-foreground text-background',
  // Terminal cancellations — muted
  cancelled_by_buyer: 'border-transparent bg-muted text-muted-foreground',
  cancelled_by_seller: 'border-transparent bg-muted text-muted-foreground',
  auto_cancelled: 'border-transparent bg-muted text-muted-foreground',
  // Disputed — destructive emphasis
  disputed: 'border-transparent bg-destructive text-destructive-foreground',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={cn('tracking-wide uppercase', VARIANT_CLASS[status])}>{LABEL[status]}</Badge>
  );
}
