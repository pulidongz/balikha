import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { cn } from '@/lib/utils';
import type { InboxThreadRow } from '@/lib/queries/messaging';

export function MessagesInbox({
  threads,
  side,
}: {
  threads: InboxThreadRow[];
  side: 'buyer' | 'seller';
}) {
  if (threads.length === 0) {
    return <p className="text-muted-foreground py-12 text-center text-sm">No conversations yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {threads.map((t) => {
        const counterparty = side === 'buyer' ? t.artisanShopNameSnapshot : t.buyerName;
        const baseHref = side === 'buyer' ? '/account/messages' : '/dashboard/messages';
        const mine = side === t.lastMessageSenderRole;
        const preview = t.lastMessageBody
          ? mine
            ? `You: ${t.lastMessageBody}`
            : t.lastMessageBody
          : '';
        return (
          <li key={t.threadId}>
            <Link
              href={`${baseHref}/${t.threadId}`}
              className={cn(
                'bg-card hover:bg-secondary/40 flex flex-col gap-2 rounded-md border p-3 transition-colors',
                t.unread && 'border-accent/40 bg-accent/5',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-foreground truncate font-medium">{counterparty}</p>
                <p className="text-muted-foreground shrink-0 text-xs">
                  {t.lastMessageAt ? formatRelativeTime(t.lastMessageAt) : ''}
                </p>
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {t.orderId
                  ? `Order ${t.orderReference}`
                  : `Asking about: ${t.productTitleSnapshot}`}
                {t.orderStatus && (
                  <span className="ml-2 align-middle">
                    <OrderStatusBadge status={t.orderStatus} />
                  </span>
                )}
              </p>
              <p className="text-foreground truncate text-sm">{preview}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
