'use server';

import { err, type Result } from '@/lib/result';

// Reorder skeleton — comment-as-roadmap. The shape of the action is locked
// in now so the UI can wire to it; the body fills in when the cart/checkout
// plan ships. Until then, the button is rendered as `disabled` and this
// action just refuses on the off chance someone routes around the UI.
//
// When checkout exists, this action will:
//   1. Load the order, verify ownership (buyerUserId === current.id).
//   2. For each order item, check if the product still exists and has
//      enough stock; collect available items, skip the rest.
//   3. Push available items into the buyer's cart (the cart action will
//      own quantity merging with anything already in the cart).
//   4. Return { cartId } so the caller can router.push('/cart').
export async function reorderAction(_input: {
  orderId: string;
}): Promise<Result<{ cartId: string }>> {
  return err('Reorder will be available when checkout ships.');
}
