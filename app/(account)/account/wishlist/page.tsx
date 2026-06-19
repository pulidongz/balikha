import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { artisanProfiles, productImages, products, wishlistItems } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Wishlist',
};

export default async function WishlistPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/wishlist');

  // Wishlist items joined with their product + artisan. We deliberately
  // do NOT filter by product status here — if a buyer wishlisted a piece
  // that's been archived or sold out, we still show it (struck through
  // visually would be a Phase-5 polish). For now the card renders as-is.
  const items = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
      addedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .innerJoin(artisanProfiles, eq(products.artisanProfileId, artisanProfiles.id))
    .where(eq(wishlistItems.userId, current.id))
    .orderBy(desc(wishlistItems.createdAt));

  // First image per product, fetched in one IN-list query rather than N+1.
  const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
  if (items.length > 0) {
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
          items.map((i) => i.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) {
        primaryByProductId.set(img.productId, { url: img.url, altText: img.altText });
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Wishlist</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {items.length === 0
            ? 'Tap the heart on any piece to save it here.'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'} saved.`}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Browse the marketplace and tap the heart on a piece to add it to your wishlist."
          action={
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <ProductGrid cols={3}>
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={{
                id: p.id,
                slug: p.slug,
                title: p.title,
                price: p.price,
                currency: p.currency,
              }}
              artisan={{ shopSlug: p.artisanShopSlug, shopName: p.artisanShopName }}
              primaryImage={primaryByProductId.get(p.id) ?? null}
              inWishlist
              isSignedIn
            />
          ))}
        </ProductGrid>
      )}
    </div>
  );
}
