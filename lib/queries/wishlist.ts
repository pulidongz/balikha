import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { wishlistItems } from '@/db/schema';

// Returns the set of product IDs currently in the user's wishlist.
// Anonymous callers (userId === null) get an empty set, so the caller can
// blindly `.has(productId)` without branching on auth state.
//
// Single index hit on `wishlist_items_user_idx`; intended to be called once
// per page render and the resulting set passed down to whichever cards
// render. Per the buyer plan §6: "Trivial cost (single index hit, returns
// a small set)."
export async function getWishlistProductIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return new Set(rows.map((r) => r.productId));
}
