import { Badge } from '@/components/ui/badge';
import { FeatureWorkButton } from '@/components/studio/feature-work-button';
import { isThinCount } from '@/lib/thin-count';
import { ProductCard } from './product-card';
import { ProductGrid } from './product-grid';

type ProductLike = {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works (T3).
  price: string | null;
  currency: string;
  primaryImage?: { url: string; altText: string | null } | null;
};

type CatalogLike = {
  id: string;
  title: string;
  description: string | null;
  isLimitedEdition: boolean;
};

type ArtisanLike = {
  shopSlug: string;
  shopName: string;
};

export function CatalogSection({
  catalog,
  artisan,
  products,
  wishlistedIds,
  isSignedIn,
  canFeature = false,
  featuredProductId = null,
  appreciationCounts,
  stagger = false,
}: {
  catalog: CatalogLike;
  artisan: ArtisanLike;
  products: ProductLike[];
  wishlistedIds: Set<string>;
  isSignedIn: boolean;
  // T2 owner view: shows a small Feature/Unpin control under each work.
  canFeature?: boolean;
  featuredProductId?: string | null;
  // T7: per-product appreciation counts; absent products read as zero.
  appreciationCounts?: Map<string, number>;
  stagger?: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-headline font-serif">{catalog.title}</h2>
          {catalog.isLimitedEdition && <Badge variant="limited">Limited</Badge>}
        </div>
        {/* Thin-count rule (T12). */}
        {!isThinCount(products.length) && (
          <p className="text-muted-foreground text-sm">
            {products.length} {products.length === 1 ? 'piece' : 'pieces'}
          </p>
        )}
      </div>
      {catalog.description && (
        <p className="text-muted-foreground max-w-copy text-sm leading-relaxed">
          {catalog.description}
        </p>
      )}
      <ProductGrid cols={4} stagger={stagger}>
        {products.map((p) => (
          <div key={p.id}>
            <ProductCard
              product={{
                id: p.id,
                slug: p.slug,
                title: p.title,
                price: p.price,
                currency: p.currency,
              }}
              artisan={artisan}
              primaryImage={p.primaryImage}
              showArtisan={false}
              inWishlist={wishlistedIds.has(p.id)}
              isSignedIn={isSignedIn}
              // canFeature is true exactly when the viewer owns this studio —
              // owners get the pin control instead of a pointless heart.
              showWishlist={!canFeature}
              appreciationCount={appreciationCounts?.get(p.id)}
            />
            {canFeature && (
              <FeatureWorkButton productId={p.id} isFeatured={featuredProductId === p.id} />
            )}
          </div>
        ))}
      </ProductGrid>
    </section>
  );
}
