import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getAvailableMaterials } from '@/lib/search/facets';
import { logSearchEvent } from '@/lib/search/log';
import Link from 'next/link';
import { getSearchSuggestions, searchAll } from '@/lib/search/queries';
import { checkSearchRateLimit } from '@/lib/search/rate-limit';
import { parseSearchParams } from '@/lib/search/url';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { ActiveFilterChips } from '@/components/search/active-filter-chips';
import { ArtisansSection } from '@/components/search/artisans-section';
import { CatalogsSection } from '@/components/search/catalogs-section';
import { MobileFiltersTrigger } from '@/components/search/mobile-filters-trigger';
import { ProductSearchGrid } from '@/components/search/product-search-grid';
import { SearchFilters } from '@/components/search/search-filters';

export const metadata: Metadata = {
  title: 'Search | Balikha',
};

// /search depends on URL search params, so it must render dynamically.
// Without this, Next.js would attempt static generation and fail.
export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);

  if (!parsed?.q) {
    return <SearchEmptyState />;
  }

  // Per-IP rate limit (E7): protect the DB from a script looping uncached
  // queries on the 1GB box. Only actual searches are limited (not the
  // empty/suggestion state above, which is cached). `x-real-ip` is the
  // proxy-set client IP the app already trusts (auth.ts, logger-context).
  // Absent (no proxy, e.g. local dev) → we can't attribute the request, so
  // we don't throttle; in prod Caddy always sets it.
  const clientIp = (await headers()).get('x-real-ip');
  if (clientIp && !checkSearchRateLimit(clientIp).allowed) {
    return <SearchThrottled query={parsed.q} />;
  }

  const filters = {
    materials: parsed.materials,
    priceMin: parsed.priceMin,
    priceMax: parsed.priceMax,
    inStockOnly: parsed.inStockOnly,
  };

  const [results, availableMaterials] = await Promise.all([
    searchAll({
      q: parsed.q,
      filters,
      cursor: parsed.cursor,
      limit: parsed.limit,
    }),
    getAvailableMaterials(),
  ]);

  // Log AFTER results are computed; the helper owns its try/catch so a
  // logging failure can't break this render.
  const user = await getCurrentUser();
  await logSearchEvent({
    query: parsed.q,
    filters,
    results,
    wasLoggedIn: Boolean(user),
  });

  const wishlistedIds = await getWishlistProductIds(user?.id ?? null);

  const totalHits = results.totalProductCount + results.artisans.length + results.catalogs.length;

  // Build the "next page" URL: keep every current search param and swap
  // in the new cursor, so pagination lives in the URL and the browser
  // Back button returns the buyer to the page they were on.
  let nextHref: string | null = null;
  if (results.products.nextCursor) {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'cursor' || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) nextParams.append(key, v);
      } else {
        nextParams.set(key, value);
      }
    }
    nextParams.set('cursor', results.products.nextCursor);
    nextHref = `/search?${nextParams.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">
          Results for <em className="not-italic">&ldquo;{parsed.q}&rdquo;</em>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {totalHits} {totalHits === 1 ? 'result' : 'results'}
        </p>
      </header>

      {totalHits === 0 ? (
        <NoResults query={parsed.q} />
      ) : (
        <div className="space-y-12">
          <ArtisansSection artisans={results.artisans} />
          <CatalogsSection catalogs={results.catalogs} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
            <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
              <SearchFilters
                query={parsed.q}
                availableMaterials={availableMaterials}
                currentFilters={filters}
              />
            </aside>
            <div className="space-y-4">
              <MobileFiltersTrigger
                query={parsed.q}
                availableMaterials={availableMaterials}
                currentFilters={filters}
              />
              <ActiveFilterChips query={parsed.q} currentFilters={filters} />
              <ProductSearchGrid
                products={results.products.items}
                nextHref={nextHref}
                wishlistedProductIds={Array.from(wishlistedIds)}
                isSignedIn={user !== null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Suggestion chips come from materials on PUBLISHED works (T14) — every
// chip is guaranteed at least one result, unlike the old hardcoded
// "vase"/"leather" copy that taught visitors the platform was empty.
async function SuggestionChips() {
  const suggestions = await getSearchSuggestions();
  if (suggestions.length === 0) return null;
  return (
    <ul className="mt-6 flex flex-wrap justify-center gap-2">
      {suggestions.map((s) => (
        <li key={s}>
          <Link
            href={`/search?q=${encodeURIComponent(s)}`}
            className="bg-secondary text-foreground hover:bg-secondary/70 inline-block rounded-full px-3 py-1.5 text-sm transition-colors"
          >
            {s}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Shown when an IP exceeds the search rate limit (E7). Calm, on-brand, and
// crucially renders WITHOUT touching the DB — the whole point is to shed
// load. No auto-retry; the visitor re-submits when ready.
async function SearchThrottled({ query }: { query: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
      <h1 className="font-serif text-3xl">One moment</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
        That&rsquo;s a lot of searching in a short time. Give it a few seconds, then look for{' '}
        <em className="not-italic">&ldquo;{query}&rdquo;</em> again.
      </p>
    </div>
  );
}

async function SearchEmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
      <h1 className="font-serif text-3xl">Search the marketplace</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
        Find handmade pieces by craft, material, or a maker&rsquo;s name — or start from
        what&rsquo;s actually on the shelves:
      </p>
      <SuggestionChips />
    </div>
  );
}

async function NoResults({ query }: { query: string }) {
  return (
    <div className="bg-card rounded-md border p-8 text-center">
      <h2 className="font-serif text-xl">No results for &ldquo;{query}&rdquo;</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Try one of these — each is on a real piece right now:
      </p>
      <SuggestionChips />
      <p className="text-muted-foreground mt-6 text-sm">
        Or browse instead:{' '}
        <Link href="/#recent" className="text-foreground underline underline-offset-4">
          recent works
        </Link>{' '}
        ·{' '}
        <Link href="/#artisans" className="text-foreground underline underline-offset-4">
          the studios
        </Link>
      </p>
    </div>
  );
}
