'use server';

import { searchAll } from '@/lib/search/queries';
import { logSearchEvent } from '@/lib/search/log';
import type { SearchResults } from '@/lib/search/types';
import { searchRequestSchema } from '@/lib/validators/search';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';

/**
 * Server action for client-driven search calls — primarily the "Load more"
 * button on /search, which posts the next cursor and appends to the rendered
 * grid. The /search page itself (server component) calls `searchAll` +
 * `logSearchEvent` directly without going through this action.
 *
 * Logs every call — no point gating analytics on whether the search was
 * triggered from the page or from a load-more click. logSearchEvent owns
 * its own try/catch, so a logging failure can't break this action.
 */
export async function search(input: unknown): Promise<Result<SearchResults>> {
  const log = await getRequestLogger();
  const parsed = searchRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid search request', parsed.error.flatten().fieldErrors);
  }

  try {
    const filters = {
      materials: parsed.data.materials,
      priceMin: parsed.data.priceMin,
      priceMax: parsed.data.priceMax,
      inStockOnly: parsed.data.inStockOnly,
    };

    const results = await searchAll({
      q: parsed.data.q,
      filters,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });

    const user = await getCurrentUser();
    await logSearchEvent({
      query: parsed.data.q,
      filters,
      results,
      wasLoggedIn: Boolean(user),
    });

    log.info(
      { q: parsed.data.q, totalProductCount: results.totalProductCount },
      'Search completed',
    );
    return ok(results);
  } catch (e) {
    log.error({ err: e }, 'Search failed');
    return err('Search failed');
  }
}
