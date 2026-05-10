'use server';

import { err, type Result } from '@/lib/result';

// Reorder stub. The signature stays stable so `ReorderButton` keeps
// compiling against this file; Phase 5 of the order-flow plan replaces
// BOTH the body AND the return type (will become
// `Result<{ productId, productSlug, artisanSlug }>` and route the user
// to the product page with `?reorder=1` for a fresh address selection).
//
// Until then, the button is rendered as `disabled` and this action just
// refuses on the off chance someone routes around the UI.
export async function reorderAction(_input: {
  orderId: string;
}): Promise<Result<{ cartId: string }>> {
  return err('Not yet implemented');
}
