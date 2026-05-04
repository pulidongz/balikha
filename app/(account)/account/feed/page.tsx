import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { artisanFollows, artisanProfiles, productImages, products } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'New listings · Balikha',
};

const PAGE_SIZE = 24;

export default async function FeedPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/feed');

  // Published products from artisans the buyer follows. Sorted newest first.
  // Pagination is deferred — Phase 5's "done when" criteria only requires
  // the feed render and the empty state; cursor pagination is a follow-up.
  const items = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      createdAt: products.createdAt,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(artisanFollows, eq(artisanFollows.artisanProfileId, artisanProfiles.id))
    .where(and(eq(artisanFollows.userId, current.id), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt))
    .limit(PAGE_SIZE);

  // Separate IN-list query for primary images, same pattern as the
  // wishlist + storefront pages.
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

  const wishlistedIds = await getWishlistProductIds(current.id);

  // Distinguish "you follow no one" from "you follow people but they
  // haven't listed anything published yet" — the empty-state copy is
  // different, and the right call-to-action is different too.
  let followsZero = false;
  if (items.length === 0) {
    const [row] = await db
      .select({ userId: artisanFollows.userId })
      .from(artisanFollows)
      .where(eq(artisanFollows.userId, current.id))
      .limit(1);
    followsZero = !row;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">New listings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Recent pieces from the artisans you follow.
        </p>
      </header>

      {items.length === 0 ? (
        followsZero ? (
          <EmptyState
            title="Follow artisans to see their new listings here"
            description="When an artisan you follow lists a new piece, it appears in this feed."
            action={
              <Link href="/" className={buttonVariants({ variant: 'outline' })}>
                Find artisans to follow
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No new listings yet"
            description="The artisans you follow haven't listed anything new. Check back soon."
          />
        )
      ) : (
        <ProductGrid cols={3}>
          {items.map((p) => (
            <li key={p.id}>
              <ProductCard
                product={{
                  id: p.id,
                  slug: p.slug,
                  title: p.title,
                  price: p.price,
                  currency: p.currency,
                }}
                artisan={{ shopSlug: p.artisanShopSlug, shopName: p.artisanShopName }}
                primaryImage={primaryByProductId.get(p.id) ?? null}
                inWishlist={wishlistedIds.has(p.id)}
                isSignedIn
              />
            </li>
          ))}
        </ProductGrid>
      )}
    </div>
  );
}
