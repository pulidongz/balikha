import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orderEvents, orders } from '@/db/schema';
import { env } from '@/env';
import { getCurrentUser } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { BuyerOrderActionButtons } from '@/components/account/buyer-order-action-buttons';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { ReorderButton } from '@/components/account/reorder-button';
import { OrderEventTimeline } from '@/components/dashboard/order-event-timeline';
import { FileDisputeButton } from '@/components/orders/dispute-buttons';
import { DisputePanel } from '@/components/orders/dispute-panel';

export const metadata = {
  title: 'Order',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// Shape of the snapshot JSON stored on `orders.shipping_address_json`.
// Mirrors user_addresses + countryCode at order time.
interface ShippingAddressSnapshot {
  recipientName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  barangay?: string | null;
  city: string;
  province: string;
  postalCode?: string | null;
  countryCode: string;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=/account/orders/${id}`);

  // Single read constrained by id + buyerUserId — IDOR-safe. Another
  // buyer's order ID returns 404, not 403 (privacy over pedantic 403).
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.buyerUserId, current.id)))
    .limit(1);
  if (!order) notFound();

  const events = await db
    .select({
      id: orderEvents.id,
      type: orderEvents.type,
      actorRole: orderEvents.actorRole,
      notes: orderEvents.notes,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, order.id))
    .orderBy(asc(orderEvents.createdAt));

  const shipping = order.shippingAddressJson as ShippingAddressSnapshot;
  // Snapshot slugs persist forever even if the underlying product/artisan
  // is renamed or deleted (FKs SET NULL). The link target is always
  // derivable from snapshot fields.
  const productLink = `/shop/${order.artisanSlugSnapshot}/${order.productSlugSnapshot}`;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/account/orders"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← All orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-medium">
            Order{' '}
            <span className="text-muted-foreground font-mono text-base font-normal">
              {order.reference}
            </span>
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground text-sm">Placed {DATE_FMT.format(order.placedAt)}</p>
      </header>

      <BuyerOrderActionButtons orderId={order.id} status={order.status} />

      {order.status === 'disputed' && <DisputePanel orderId={order.id} viewerRole="buyer" />}

      {order.status === 'shipped' && (
        // Dispute-window advisory. The auto-confirm timeout and the
        // dispute-eligible window both terminate on the same day, so a
        // late dispute on a non-delivered package gets locked out by
        // the auto-complete. Per Issue 20 (Phase 6 §8 / plan resolution
        // option c), we accept the trade-off and surface the deadline
        // explicitly to buyers rather than extending the window.
        <aside className="border-warning/30 bg-warning/5 text-muted-foreground rounded-md border p-3 text-sm">
          If you don&rsquo;t receive your order, please file a dispute within{' '}
          <strong className="text-foreground">{env.ORDER_BUYER_AUTO_CONFIRM_DAYS} days</strong> of
          shipment. After that, this order will be auto-confirmed and dispute filing is no longer
          available.
        </aside>
      )}

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Item</h2>
        <div className="ring-foreground/10 mt-3 flex items-center gap-4 rounded-xl p-4 ring-1">
          <div className="bg-secondary relative h-16 w-16 shrink-0 overflow-hidden rounded">
            {order.productImageUrlSnapshot ? (
              <Image
                src={order.productImageUrlSnapshot}
                alt={order.productTitleSnapshot}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Link
              href={productLink}
              className="text-foreground hover:text-accent block truncate text-sm font-medium transition-colors"
            >
              {order.productTitleSnapshot}
            </Link>
            <p className="text-muted-foreground text-xs">{order.artisanNameSnapshot}</p>
          </div>
          <p className="shrink-0 text-sm tabular-nums">
            {formatPrice(order.priceSnapshot, order.currency)}
          </p>
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Ship to
        </h2>
        <address className="text-muted-foreground mt-3 text-sm not-italic">
          <p className="text-foreground font-medium">{shipping.recipientName}</p>
          {shipping.phone && <p>{shipping.phone}</p>}
          <p className="mt-1">{shipping.line1}</p>
          {shipping.line2 && <p>{shipping.line2}</p>}
          <p>
            {[shipping.barangay, shipping.city, shipping.province].filter(Boolean).join(', ')}
            {shipping.postalCode && ` ${shipping.postalCode}`}
          </p>
          <p>{shipping.countryCode}</p>
        </address>
      </section>

      {order.notesFromBuyer && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Notes
          </h2>
          <p className="text-foreground mt-3 text-sm whitespace-pre-line">{order.notesFromBuyer}</p>
        </section>
      )}

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Timeline
        </h2>
        <div className="mt-3">
          <OrderEventTimeline events={events} status={order.status} viewerRole="buyer" />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <FileDisputeButton orderId={order.id} status={order.status} />
        <ReorderButton
          orderId={order.id}
          // ReorderButton only fires when the product is potentially
          // re-orderable. Phase 5 wires the action; if the product was
          // deleted (productId is null) the server will refuse and the
          // button shows that as inline error.
          disabled={order.productId === null}
        />
      </div>
    </div>
  );
}
