'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { search } from '@/lib/actions/search';
import type { ProductFilters, ProductHit } from '@/lib/search/types';

interface Props {
  initialProducts: ProductHit[];
  initialNextCursor: string | null;
  query: string;
  filters: ProductFilters;
  // Set is not RSC-serializable; the server passes a string[] and we
  // rebuild the Set in-component for O(1) `.has()` per card.
  wishlistedProductIds: string[];
  isSignedIn: boolean;
}

/**
 * Product result grid with cursor-based "Load more". The initial page is
 * server-rendered (server component passes initialProducts/initialNextCursor);
 * subsequent pages come from the `search` server action and append to local
 * state. URL doesn't change on load-more clicks — pagination is client state,
 * unlike filters which live in the URL.
 */
export function ProductSearchGrid({
  initialProducts,
  initialNextCursor,
  query,
  filters,
  wishlistedProductIds,
  isSignedIn,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wishlistedSet = useMemo(() => new Set(wishlistedProductIds), [wishlistedProductIds]);

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const result = await search({
        q: query,
        materials: filters.materials,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        inStockOnly: filters.inStockOnly,
        cursor,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProducts((prev) => [...prev, ...result.data.products.items]);
      setCursor(result.data.products.nextCursor);
    });
  }

  if (products.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-md border p-8 text-center text-sm">
        No products match your filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              artisan={{ shopSlug: p.artisanSlug, shopName: p.artisanName }}
              primaryImage={p.imageUrl ? { url: p.imageUrl, altText: p.title } : null}
              responseTimeLabel={p.responseTimeLabel ?? undefined}
              inWishlist={wishlistedSet.has(p.id)}
              isSignedIn={isSignedIn}
            />
          </li>
        ))}
      </ProductGrid>
      {error && <p className="text-destructive text-center text-sm">{error}</p>}
      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
