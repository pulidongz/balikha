import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

/**
 * Distinct materials across all published products. Powers the materials
 * filter checkbox group on /search.
 *
 * `unstable_cache` with a 5-minute TTL bounds the worst case: even if the
 * tag-revalidate path misses (e.g. a direct DB write outside our actions),
 * the facet self-corrects within five minutes. Product mutations call
 * `revalidateTag('search-facets')` to refresh proactively — see the four
 * sites in lib/actions/product.ts.
 *
 * `unnest` flattens text[] into rows; DISTINCT collapses duplicates.
 * Filtering by status='published' matches what the marketplace surfaces;
 * draft/archived materials shouldn't influence the buyer-facing facet.
 */
export const FACET_TAG = 'search-facets';

type MaterialRow = { material: string } & Record<string, unknown>;

export const getAvailableMaterials = unstable_cache(
  async (): Promise<string[]> => {
    const result = await db.execute<MaterialRow>(sql`
      SELECT DISTINCT unnest(materials) AS material
      FROM products
      WHERE status = 'published' AND materials IS NOT NULL
      ORDER BY material
    `);
    return Array.from(result, (r) => r.material);
  },
  ['available-materials'],
  { revalidate: 300, tags: [FACET_TAG] },
);
