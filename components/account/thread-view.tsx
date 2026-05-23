import Link from 'next/link';
import type { ReactNode } from 'react';
import { MessageComposer } from './message-composer';
import { OrderStatusBadge } from './order-status-badge';
import { Button } from '@/components/ui/button';
import type { OrderStatus } from '@/lib/orders/types';
import type { MessageThread, MessageSenderRole, ThreadWriteState } from '@/lib/messaging/types';
import type { MessageWithSender } from '@/lib/queries/messaging';

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function ThreadView({
  thread,
  messages,
  viewerRole,
  writeState,
  orderStatus,
  orderReference,
  headerExtra,
  readOnly = false,
  blockedByMe = false,
  blockedByThem = false,
}: {
  thread: MessageThread;
  messages: MessageWithSender[];
  viewerRole: MessageSenderRole;
  writeState: ThreadWriteState;
  orderStatus: OrderStatus | null;
  orderReference: string | null;
  // Seller surface injects a <BlockBuyerButton/> here (§7.5); other
  // surfaces pass nothing. Keeps ThreadView audience-agnostic.
  headerExtra?: ReactNode;
  // Admin report / dispute view renders read-only — no composer, no
  // Report affordance, no Order CTA — regardless of writeState (§8.3).
  readOnly?: boolean;
  // Block state (pre-purchase threads only). EITHER true → composer is
  // hidden and a clear panel explains why. The block effect is symmetric:
  // one block pauses the conversation for both sides, mirroring the
  // server-side rejection in sendMessage.
  blockedByMe?: boolean;
  blockedByThem?: boolean;
}) {
  const counterpartyLabel = viewerRole === 'buyer' ? thread.artisanShopNameSnapshot : 'Buyer';

  const orderHref = thread.orderId
    ? viewerRole === 'buyer'
      ? `/account/orders/${thread.orderId}`
      : `/dashboard/orders/${thread.orderId}`
    : null;

  const isBlocked = blockedByMe || blockedByThem;

  // "Order this piece" — shown only to a buyer on a still-pre-purchase
  // thread. Routes to the product page with ?threadId so OrderDialog
  // auto-opens (§6.10a) and the placed order pivots this thread. The
  // thread's snapshot columns hold every part of the URL. Block state
  // intentionally does NOT gate this: the block is messaging-only, and
  // a buyer/seller who wants to transact despite the messaging pause
  // should be able to.
  const showOrderCta = viewerRole === 'buyer' && !thread.orderId && !readOnly;
  const orderCtaHref = `/shop/${thread.artisanShopSlugSnapshot}/${thread.productSlugSnapshot}?threadId=${thread.id}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={viewerRole === 'buyer' ? '/account/messages' : '/dashboard/messages'}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← All messages
        </Link>
        <h1 className="text-xl font-medium">Conversation with {counterpartyLabel}</h1>
        <p className="text-muted-foreground text-sm">
          {thread.orderId && orderHref ? (
            <>
              <Link href={orderHref} className="hover:underline">
                Order {orderReference}
              </Link>
              {orderStatus && (
                <span className="ml-2 align-middle">
                  <OrderStatusBadge status={orderStatus} />
                </span>
              )}
            </>
          ) : (
            <>Asking about: {thread.productTitleSnapshot}</>
          )}
        </p>
        {headerExtra}
      </header>

      <ol className="space-y-4">
        {messages.map((m) => {
          // Explicit role pairing rather than `m.senderRole ===
          // viewerRole` so a future 'system' sender role renders as
          // "not mine" without touching every renderer.
          const mine =
            (m.senderRole === 'buyer' && viewerRole === 'buyer') ||
            (m.senderRole === 'seller' && viewerRole === 'seller');
          return (
            <li
              key={m.id}
              className={
                mine
                  ? 'border-accent/40 bg-accent/5 space-y-1 rounded-md border p-3'
                  : 'space-y-1 rounded-md border p-3'
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-foreground text-sm font-medium">{mine ? 'You' : m.senderName}</p>
                <p className="text-muted-foreground text-xs">{DATE_TIME_FMT.format(m.createdAt)}</p>
              </div>
              <p className="text-foreground text-sm whitespace-pre-line">{m.body}</p>
            </li>
          );
        })}
      </ol>

      {showOrderCta && (
        <div>
          <Link href={orderCtaHref}>
            <Button variant="outline">Order this piece →</Button>
          </Link>
        </div>
      )}

      {!readOnly && isBlocked && (
        <p
          className="text-muted-foreground border-muted bg-muted/30 rounded-md border p-3 text-sm"
          role="status"
        >
          {blockedByMe
            ? viewerRole === 'buyer'
              ? `You've blocked ${thread.artisanShopNameSnapshot}. This conversation is paused for both of you until you unblock from your Blocked makers list.`
              : `You've blocked this buyer. This conversation is paused for both of you until you unblock from your Blocked buyers settings.`
            : viewerRole === 'buyer'
              ? `${thread.artisanShopNameSnapshot} has paused this conversation. You'll be able to message again if they unblock you.`
              : `This buyer has paused this conversation. You'll be able to message again if they unblock you.`}
        </p>
      )}
      {!readOnly && !isBlocked && writeState.kind === 'open' && (
        <MessageComposer threadId={thread.id} />
      )}
      {!readOnly && !isBlocked && writeState.kind === 'closed' && (
        <p className="text-muted-foreground text-sm">
          This conversation is closed. Existing messages remain visible.
        </p>
      )}
    </div>
  );
}
