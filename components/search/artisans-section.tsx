import Link from 'next/link';
import type { ArtisanHit } from '@/lib/search/types';

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Horizontal strip of matched artisans rendered above the product grid.
 * Initial-letter avatar (banners are 16:4 — wrong shape for a chip) plus
 * shop name, location, and a bio snippet. Links to the artisan storefront.
 */
export function ArtisansSection({ artisans }: { artisans: ArtisanHit[] }) {
  if (artisans.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Artisans
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {artisans.map((a) => (
          <Link
            key={a.id}
            href={`/shop/${a.shopSlug}`}
            className="group bg-card hover:bg-secondary/40 flex items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <div className="bg-secondary flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-medium">
              {initialOf(a.shopName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="group-hover:text-accent truncate text-sm font-medium transition-colors">
                {a.shopName}
              </p>
              {a.location && <p className="text-muted-foreground text-xs">{a.location}</p>}
              {a.bio && <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{a.bio}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
