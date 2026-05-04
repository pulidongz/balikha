import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq, inArray } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { OrderRow } from '@/components/account/order-row';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Orders · Balikha',
};

const PAGE_SIZE = 50;

export default async function OrdersPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/orders');

  const list = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      total: orders.total,
      currency: orders.currency,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(eq(orders.buyerUserId, current.id))
    .orderBy(desc(orders.placedAt))
    .limit(PAGE_SIZE);

  // Item counts in one IN-list query rather than N+1. Counted in JS
  // (PAGE_SIZE rows max in `list`, so the items collection is bounded
  // by however many lines a buyer puts in 50 orders — small enough).
  const itemCountById = new Map<string, number>();
  if (list.length > 0) {
    const itemRows = await db
      .select({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          list.map((o) => o.id),
        ),
      );
    for (const row of itemRows) {
      itemCountById.set(row.orderId, (itemCountById.get(row.orderId) ?? 0) + 1);
    }
  }

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
          description="When you buy something on Balikha, it will appear here. Cart and checkout are coming in a later phase."
          action={
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} itemCount={itemCountById.get(o.id) ?? 0} />
          ))}
        </ul>
      )}
    </div>
  );
}
