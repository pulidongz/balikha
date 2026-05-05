import { ProductCard } from '@/components/marketplace/product-card';
import { SectionHeader } from './section-header';
import { EmptyInline } from './empty-inline';
import type { PreviewProductItem } from '@/lib/queries/account';

// 6 most-recent products from artisans the buyer follows. 3-up grid on
// md+ — same shape as the dedicated /account/feed page so they feel
// consistent when the buyer "View all →"s through.
export function FeedPreview({
  items,
  wishlistedIds,
}: {
  items: PreviewProductItem[];
  wishlistedIds: Set<string>;
}) {
  return (
    <section>
      <SectionHeader
        title="From artisans you follow"
        viewAllHref="/account/feed"
        showViewAll={items.length > 0}
      />
      {items.length === 0 ? (
        <EmptyInline
          message="Follow artisans to see their new listings here."
          ctaHref="/"
          ctaLabel="Browse the marketplace"
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3">
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
                inWishlist={wishlistedIds.has(p.id)}
                isSignedIn
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
