import { ProductCard } from '@/components/marketplace/product-card';
import { SectionHeader } from './section-header';
import { EmptyInline } from './empty-inline';
import type { PreviewProductItem } from '@/lib/queries/account';

// 4 most-recently saved wishlist items. Every shown item is — by
// definition — in the wishlist, so inWishlist=true is hard-coded and we
// skip the wishlist-set lookup that the feed preview needs.
export function WishlistPreview({ items }: { items: PreviewProductItem[] }) {
  return (
    <section>
      <SectionHeader
        title="From your wishlist"
        viewAllHref="/account/wishlist"
        showViewAll={items.length > 0}
      />
      {items.length === 0 ? (
        <EmptyInline
          message="Tap the heart on any product to save it here."
          ctaHref="/"
          ctaLabel="Browse the marketplace"
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
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
                primaryImage={p.primaryImage}
                inWishlist
                isSignedIn
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
