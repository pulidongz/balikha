import { eq } from 'drizzle-orm';
import type { Tx } from '@/db';
import { products } from '@/db/schema';
import type { Order } from '@/lib/orders/types';

// Return one unit of stock to the product, conditional on the order not
// having shipped yet. Used as an `onTransition` callback by every pre-
// shipment cancellation path (decline, cancelAsBuyer, cancelAsSeller,
// and the auto-cancel tick). The check `order.shippedAt === null` is
// the durable signal of "did this item physically leave the seller's
// possession" — see the Phase 8 stock-handling matrix.
//
// Lives in lib/orders/ (not lib/actions/) so the tick script can import
// it without pulling in the 'use server' module boundary, which would
// reject non-serializable arguments like Tx.
export async function returnStockIfPreShipment(tx: Tx, order: Order): Promise<void> {
  if (order.shippedAt !== null) return;
  if (!order.productId) return;

  const [product] = await tx
    .select()
    .from(products)
    .where(eq(products.id, order.productId))
    .for('update')
    .limit(1);
  if (!product) return;

  await tx
    .update(products)
    .set({
      stockOnHand: product.stockOnHand + 1,
      // If the product was flipped to sold_out by the placement we're
      // reversing, bring it back to published. Other statuses (draft,
      // archived) stay as the seller left them.
      status: product.status === 'sold_out' ? 'published' : product.status,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));
}
