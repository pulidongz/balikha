import Link from 'next/link';
import type { CatalogHit } from '@/lib/search/types';

/**
 * Horizontal strip of matched catalogs. Catalog detail pages don't
 * exist yet (out of scope per plan §11), so hits link to the artisan
 * storefront with a `?catalog=<slug>` hint the storefront can use to
 * highlight the matching catalog.
 */
export function CatalogsSection({ catalogs }: { catalogs: CatalogHit[] }) {
  if (catalogs.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Catalogs
      </h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {catalogs.map((c) => (
          <Link
            key={c.id}
            href={`/shop/${c.artisanSlug}?catalog=${c.slug}`}
            className="group block space-y-0.5 focus-visible:outline-none"
          >
            <p className="group-hover:text-accent text-sm font-medium transition-colors">
              {c.title}
            </p>
            <p className="text-muted-foreground text-xs">{c.artisanName}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
