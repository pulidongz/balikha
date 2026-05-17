import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import type { ProductHit } from '@/lib/search/types';

interface Props {
  products: ProductHit[];
  // Pre-built URL for the next page (current query + filters + cursor),
  // or null when there are no further pages.
  nextHref: string | null;
  wishlistedProductIds: string[];
  isSignedIn: boolean;
}

/**
 * Product result grid with cursor-based pagination. Each page is its own
 * URL (`/search?...&cursor=`), so the browser Back button returns the
 * buyer to the exact page they left — pagination state lives in the URL,
 * the same model the home grid uses. Forward-only: "Next" advances, Back
 * retreats.
 */
export function ProductSearchGrid({ products, nextHref, wishlistedProductIds, isSignedIn }: Props) {
  if (products.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-md border p-8 text-center text-sm">
        No products match your filters.
      </div>
    );
  }

  const wishlisted = new Set(wishlistedProductIds);

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
              inWishlist={wishlisted.has(p.id)}
              isSignedIn={isSignedIn}
            />
          </li>
        ))}
      </ProductGrid>
      {nextHref && (
        <div className="flex justify-center">
          <Link href={nextHref} className={buttonVariants({ variant: 'outline' })}>
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
