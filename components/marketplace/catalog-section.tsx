import { Badge } from '@/components/ui/badge';
import { ProductCard } from './product-card';
import { ProductGrid } from './product-grid';

type ProductLike = {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  primaryImage?: { url: string; altText: string | null } | null;
};

type CatalogLike = {
  id: string;
  title: string;
  description: string | null;
  releaseAt: Date | null;
  closesAt: Date | null;
};

type ArtisanLike = {
  shopSlug: string;
  shopName: string;
};

function isLimited(catalog: CatalogLike): boolean {
  // A catalog with both release and close dates within a finite window reads as
  // a limited drop. This is a soft signal — artists set whichever they want.
  return Boolean(catalog.releaseAt && catalog.closesAt);
}

export function CatalogSection({
  catalog,
  artisan,
  products,
  wishlistedIds,
  isSignedIn,
}: {
  catalog: CatalogLike;
  artisan: ArtisanLike;
  products: ProductLike[];
  wishlistedIds: Set<string>;
  isSignedIn: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl tracking-tight">{catalog.title}</h2>
          {isLimited(catalog) && (
            <Badge className="text-foreground border-transparent bg-[var(--gold)] tracking-wide uppercase">
              Limited
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {products.length} {products.length === 1 ? 'piece' : 'pieces'}
        </p>
      </div>
      {catalog.description && (
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {catalog.description}
        </p>
      )}
      <ProductGrid cols={4}>
        {products.map((p) => (
          <li key={p.id}>
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
            />
          </li>
        ))}
      </ProductGrid>
    </section>
  );
}
