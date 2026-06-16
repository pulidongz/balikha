import { headers } from 'next/headers';
import { db } from '@/db';
import { searchEvents } from '@/db/schema';
import { logger } from '@/lib/logger';
import type { ProductFilters, SearchResults } from './types';
import { isLikelyBotQuery } from './bot-filter';

const REQUEST_ID_HEADER = 'x-request-id';

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

function hasAnyFilters(filters: ProductFilters | undefined): boolean {
  if (!filters) return false;
  return Boolean(
    (filters.materials && filters.materials.length > 0) ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.inStockOnly,
  );
}

/**
 * Append a row to `search_events`. Wraps the insert in try/catch — analytics
 * logging is non-essential, and a DB hiccup here MUST NOT break the search
 * response. Errors go to Pino and the function returns normally so callers
 * never have to think about logging failures.
 *
 * Callers should NOT add their own try/catch around this — that's the rule
 * the helper is enforcing. (See plan §10 conventions: "Logging failures
 * must never break user-facing search.")
 */
export async function logSearchEvent(opts: {
  query: string;
  filters: ProductFilters | undefined;
  results: SearchResults;
  wasLoggedIn: boolean;
}) {
  try {
    const h = await headers();
    const requestId = h.get(REQUEST_ID_HEADER) ?? null;

    await db.insert(searchEvents).values({
      query: opts.query,
      normalizedQuery: normalizeQuery(opts.query),
      isSuspectedBot: isLikelyBotQuery(opts.query),
      productResultCount: opts.results.totalProductCount,
      artisanResultCount: opts.results.artisans.length,
      catalogResultCount: opts.results.catalogs.length,
      resultCount:
        opts.results.totalProductCount +
        opts.results.artisans.length +
        opts.results.catalogs.length,
      hadFilters: hasAnyFilters(opts.filters),
      wasLoggedIn: opts.wasLoggedIn,
      requestId,
    });
  } catch (e) {
    logger.error({ err: e, query: opts.query }, 'Failed to log search event');
  }
}
