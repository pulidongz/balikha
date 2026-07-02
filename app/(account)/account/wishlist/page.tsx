import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-helpers';
import { countWishlistItems, getWishlistPage } from '@/lib/queries/wishlist';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Wishlist',
};

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/wishlist');

  const { cursor } = await searchParams;
  const [page, total] = await Promise.all([
    getWishlistPage(current.id, { cursor }),
    countWishlistItems(current.id),
  ]);
  const items = page.items;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Wishlist</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {total === 0
            ? 'Tap the heart on any piece to save it here.'
            : `${total} ${total === 1 ? 'item' : 'items'} saved.`}
        </p>
      </header>

      {total === 0 ? (
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
        <>
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
                primaryImage={p.primaryImage}
                inWishlist
                isSignedIn
              />
            ))}
          </ProductGrid>

          {page.nextCursor && (
            <div className="mt-12 flex justify-center">
              <Link
                href={`/account/wishlist?cursor=${page.nextCursor}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Next →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
