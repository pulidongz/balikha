import Link from 'next/link';
import { studioPath } from '@/lib/routes';
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
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {artisans.map((a) => (
          <Link
            key={a.id}
            href={studioPath(a.shopSlug)}
            className="group flex items-start gap-3 focus-visible:outline-none"
          >
            <div className="bg-secondary flex h-12 w-12 flex-none items-center justify-center rounded-full font-serif text-base">
              {initialOf(a.shopName)}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
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
