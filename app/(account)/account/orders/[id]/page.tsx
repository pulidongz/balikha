import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { BuyerOrderActionButtons } from '@/components/account/buyer-order-action-buttons';
import { OrderStatusBadge } from '@/components/account/order-status-badge';
import { ReorderButton } from '@/components/account/reorder-button';

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
          <h1 className="font-mono text-2xl">{order.reference}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground text-sm">Placed {DATE_FMT.format(order.placedAt)}</p>
      </header>

      <BuyerOrderActionButtons orderId={order.id} status={order.status} />

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
