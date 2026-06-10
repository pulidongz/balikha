import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, orderDisputes, orderEvents, orders, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { EmbeddedThread } from '@/components/orders/embedded-thread';
import { formatPrice } from '@/lib/format';
import { studioPath, workPath } from '@/lib/routes';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { AdminOrderActions } from '@/components/admin/admin-order-actions';
import { OrderEventTimeline } from '@/components/dashboard/order-event-timeline';

export const metadata = { title: 'Order — Admin' };

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

interface ShippingSnapshot {
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

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Capture admin's return so EmbeddedThread receives viewerUserId
  // (required by the prop, though unused on the adminReadOnly path —
  // that branch loads via getThreadForAdmin and skips markThreadRead).
  const admin = await requireAdmin();
  const { id } = await params;

  const [row] = await db
    .select({
      order: orders,
      buyerName: user.name,
      buyerEmail: user.email,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.buyerUserId))
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, orders.artisanProfileId))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) notFound();
  const { order, buyerName, buyerEmail, artisanShopName } = row;

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

  // Show every dispute on this order (open + resolved) — admin needs
  // the full history, not just the most-recent active row.
  const disputes = await db
    .select()
    .from(orderDisputes)
    .where(eq(orderDisputes.orderId, order.id))
    .orderBy(desc(orderDisputes.filedAt));

  const activeDispute = disputes.find((d) => d.status === 'open' || d.status === 'under_review');
  const shipping = order.shippingAddressJson as ShippingSnapshot;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/orders" className="hover:underline">
            ← All orders
          </Link>
        </p>
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

      <AdminOrderActions orderId={order.id} status={order.status} />

      {/* Active dispute — both parties' statements + admin context. */}
      {activeDispute && (
        <section className="border-destructive/30 bg-destructive/5 space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium tracking-wide uppercase">
            Active dispute · filed by {activeDispute.filedByRole}
          </h2>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Filer&rsquo;s reason
            </p>
            <p className="mt-1 text-sm whitespace-pre-line">{activeDispute.reason}</p>
          </div>
          {activeDispute.buyerStatement && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Buyer&rsquo;s statement
              </p>
              <p className="mt-1 text-sm whitespace-pre-line">{activeDispute.buyerStatement}</p>
            </div>
          )}
          {activeDispute.sellerStatement && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Artist&rsquo;s statement
              </p>
              <p className="mt-1 text-sm whitespace-pre-line">{activeDispute.sellerStatement}</p>
            </div>
          )}
        </section>
      )}

      {/* Disputed-order conversation: read-only thread view so admin
          can see the full back-and-forth that led to the dispute.
          adminReadOnly forces getThreadForAdmin + readOnly render. */}
      {order.status === 'disputed' && (
        <EmbeddedThread orderId={order.id} viewerUserId={admin.id} adminReadOnly />
      )}

      {/* Past disputes — collapsed historical view for repeat disputes. */}
      {disputes.length > (activeDispute ? 1 : 0) && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Past disputes
          </h2>
          <ul className="mt-3 space-y-4">
            {disputes
              .filter((d) => d.id !== activeDispute?.id)
              .map((d) => (
                <li key={d.id} className="text-sm">
                  <p className="font-medium">
                    {d.status === 'resolved_for_buyer' && 'Resolved for buyer'}
                    {d.status === 'resolved_for_seller' && 'Resolved for seller'}
                    {d.status === 'resolved_neutral' && 'Resolved neutral'}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Filed by {d.filedByRole} on {DATE_FMT.format(d.filedAt)}
                    {d.resolvedAt && ` · resolved ${DATE_FMT.format(d.resolvedAt)}`}
                  </p>
                  {d.adminResolution && (
                    <p className="mt-2 text-sm whitespace-pre-line">{d.adminResolution}</p>
                  )}
                </li>
              ))}
          </ul>
        </section>
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
              href={workPath(order.artisanSlugSnapshot, order.productSlugSnapshot)}
              className="text-foreground hover:text-accent block truncate text-sm font-medium transition-colors"
            >
              {order.productTitleSnapshot}
            </Link>
            <p className="text-muted-foreground text-xs">
              {artisanShopName} (snapshot: {order.artisanNameSnapshot})
            </p>
          </div>
          <p className="shrink-0 text-sm tabular-nums">
            {formatPrice(order.priceSnapshot, order.currency)}
          </p>
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Parties
        </h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div className="text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase">Buyer</p>
            <p className="text-foreground mt-1 font-medium">{buyerName}</p>
            <p className="text-muted-foreground text-xs">{buyerEmail}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase">Artist</p>
            <p className="text-foreground mt-1 font-medium">{artisanShopName}</p>
            <Link
              href={studioPath(order.artisanSlugSnapshot)}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              View studio
            </Link>
          </div>
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
            Note from buyer
          </h2>
          <p className="mt-3 text-sm whitespace-pre-line">{order.notesFromBuyer}</p>
        </section>
      )}

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Timeline
        </h2>
        {/* Admin viewer: not a party to the order, so the timeline never
            labels an action "by you" — events read by their actor role. */}
        <div className="mt-3">
          <OrderEventTimeline events={events} status={order.status} viewerRole="admin" />
        </div>
      </section>
    </div>
  );
}
