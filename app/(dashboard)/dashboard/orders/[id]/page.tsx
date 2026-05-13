import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orderEvents, orders, user } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { OrderActionButtons } from '@/components/dashboard/order-action-buttons';
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

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireSellerProfile();

  // Ownership baked into the WHERE — IDOR-safe. Another seller's order
  // ID returns 404, not 403 (privacy over pedantic 403).
  const [row] = await db
    .select({
      order: orders,
      buyerName: user.name,
      buyerEmail: user.email,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.buyerUserId))
    .where(and(eq(orders.id, id), eq(orders.artisanProfileId, profile.id)))
    .limit(1);
  if (!row) notFound();
  const { order, buyerName, buyerEmail } = row;

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
  const productLink = `/shop/${order.artisanSlugSnapshot}/${order.productSlugSnapshot}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard/orders" className="hover:underline">
            ← Orders
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl">{order.reference}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground text-sm">Placed {DATE_FMT.format(order.placedAt)}</p>
      </header>

      {/* Action buttons appropriate to the current status. Render
          nothing for terminal states (completed, cancelled, disputed). */}
      <section className="space-y-3">
        <OrderActionButtons orderId={order.id} status={order.status} />
      </section>

      {order.status === 'disputed' && <DisputePanel orderId={order.id} viewerRole="seller" />}

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Item</h2>
        <div className="bg-card flex items-center gap-4 rounded-md border p-4">
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Buyer</h2>
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">
          <p className="text-foreground font-medium">{buyerName}</p>
          <p>{buyerEmail}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Ship to</h2>
        <address className="bg-card text-muted-foreground rounded-md border p-4 text-sm not-italic">
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
        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-wide uppercase">Note from buyer</h2>
          <p className="bg-card text-foreground rounded-md border p-4 text-sm whitespace-pre-line">
            {order.notesFromBuyer}
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Timeline</h2>
        <OrderEventTimeline events={events} viewerRole="seller" />
      </section>

      {/* Either party can file a dispute on a non-terminal order. The
          button hides itself for terminal/already-disputed orders. */}
      <div className="text-right">
        <FileDisputeButton orderId={order.id} status={order.status} />
      </div>
    </div>
  );
}
