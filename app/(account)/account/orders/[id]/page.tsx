import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { ReorderButton } from '@/components/account/reorder-button';

export const metadata = {
  title: 'Order · Balikha',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// Shape of the snapshot JSON stored on `orders.shipping_address_json`.
// Mirrors user_addresses + countryCode at order time. Future checkout
// writes this; for now the type is what readers should expect.
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

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id));

  const shipping = order.shippingAddressJson as ShippingAddressSnapshot;

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
          <h1 className="font-mono text-2xl">{order.reference}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground text-sm">Placed {DATE_FMT.format(order.placedAt)}</p>
      </header>

      {/* Line items — snapshot data, NOT joined to current product state.
          Product/artisan slugs are snapshot too so links remain valid even
          if a piece is later renamed; if the underlying product/artisan
          row was deleted, the foreign keys are SET NULL and the snapshot
          still tells the truthful purchase history. */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Items</h2>
        <ul className="bg-card divide-y rounded-md border">
          {items.map((it) => {
            // The product/artisan FKs are SET NULL on delete, but the
            // snapshot slugs persist forever — so the link target is
            // always derivable. Render as a plain span only if both the
            // FK and snapshot were already null at order time (shouldn't
            // happen given snapshots are NOT NULL in the schema, but
            // defensively typed here).
            const productLink = `/shop/${it.artisanSlugSnapshot}/${it.productSlugSnapshot}`;
            const titleClass =
              'text-foreground hover:text-accent block truncate text-sm font-medium transition-colors';
            return (
              <li key={it.id} className="flex items-center gap-4 p-4">
                <div className="bg-secondary relative h-16 w-16 shrink-0 overflow-hidden rounded">
                  {it.imageUrlSnapshot ? (
                    <Image
                      src={it.imageUrlSnapshot}
                      alt={it.titleSnapshot}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={productLink} className={titleClass}>
                    {it.titleSnapshot}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {it.artisanNameSnapshot} · qty {it.quantity}
                  </p>
                </div>
                <p className="shrink-0 text-sm tabular-nums">
                  {formatPrice(it.lineTotal, order.currency)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Totals */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Totals</h2>
        <dl className="bg-card space-y-2 rounded-md border p-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatPrice(order.subtotal, order.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{formatPrice(order.shippingFee, order.currency)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <dt>Total</dt>
            <dd>{formatPrice(order.total, order.currency)}</dd>
          </div>
        </dl>
      </section>

      {/* Shipping address snapshot */}
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
          <h2 className="text-sm font-medium tracking-wide uppercase">Notes</h2>
          <p className="bg-card text-foreground rounded-md border p-4 text-sm whitespace-pre-line">
            {order.notesFromBuyer}
          </p>
        </section>
      )}

      <div className="flex justify-end">
        <ReorderButton orderId={order.id} />
      </div>
    </div>
  );
}
