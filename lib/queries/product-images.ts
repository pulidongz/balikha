import { asc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { productImages } from '@/db/schema';

/**
 * Attach each row's primary product image via one IN-list query (no N+1).
 * "Primary image" = position-ordered, first wins. Shared by every listing
 * surface (account landing, wishlist, feed, browse) so the definition lives in
 * one place. Generic over `{ id: string }` — the id must be the product id.
 */
export async function attachPrimaryImages<T extends { id: string }>(
  rows: T[],
): Promise<Array<T & { primaryImage: { url: string; altText: string | null } | null }>> {
  if (rows.length === 0) return [];
  const imageRows = await db
    .select({
      productId: productImages.productId,
      url: productImages.url,
      altText: productImages.altText,
    })
    .from(productImages)
    .where(
      inArray(
        productImages.productId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(productImages.position));

  const primaryById = new Map<string, { url: string; altText: string | null }>();
  for (const img of imageRows) {
    if (!primaryById.has(img.productId)) {
      primaryById.set(img.productId, { url: img.url, altText: img.altText });
    }
  }
  return rows.map((r) => ({ ...r, primaryImage: primaryById.get(r.id) ?? null }));
}
