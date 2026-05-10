import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { OrderRow } from '@/components/account/order-row';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Orders',
};

const PAGE_SIZE = 50;

export default async function OrdersPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/orders');

  // Single-item orders — the product info is snapshotted directly onto
  // the order row, so no orderItems join is needed.
  const list = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      productTitleSnapshot: orders.productTitleSnapshot,
      priceSnapshot: orders.priceSnapshot,
      currency: orders.currency,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(eq(orders.buyerUserId, current.id))
    .orderBy(desc(orders.placedAt))
    .limit(PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Orders</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {list.length === 0
            ? 'No orders yet.'
            : `${list.length} ${list.length === 1 ? 'order' : 'orders'}`}
        </p>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="You haven't placed an order yet"
          description="When you buy something on Balikha, it will appear here."
          action={
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}
