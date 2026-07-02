import { unstable_cache } from 'next/cache';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { clampLimit } from '@/lib/queries/paginate';
import { FACET_TAG } from '@/lib/search/facets';
import { bucketLabel, getSellerReputationsForArtisans } from '@/lib/queries/seller-reputation';
import type {
  ArtisanHit,
  CatalogHit,
  ProductFilters,
  ProductHit,
  SearchRequest,
  SearchResults,
} from './types';

// Maximum hits per non-product section. Artisans/catalogs are summary
// strips above the product grid — more than this and the page becomes
// noisy without adding signal. Products get the paginated grid.
const ARTISAN_LIMIT = 4;
const CATALOG_LIMIT = 4;

/**
 * Sanitize a user query into a tsquery-safe expression.
 *
 * - Strips operators that would let users construct DoS or boolean
 *   queries (`!`, `&`, `|`, parens). What remains is alphanumeric +
 *   whitespace.
 * - Splits on whitespace and joins with `&` so all words must match.
 * - Appends `:*` to the last term for prefix matching ("vase" matches
 *   "vases" without explicit stemming).
 *
 * Example: "blue stoneware vase" → "blue & stoneware & vase:*"
 *
 * Returns "" when the query yields no usable terms (callers should
 * short-circuit to empty results rather than passing this to to_tsquery).
 */
export function buildTsQuery(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 50);
  if (words.length === 0) return '';
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(' & ');
}

// --- Cursor for ranked product results ------------------------------------
//
// Search ranks are floats from ts_rank_cd plus filtering through the GIN
// index, so a (createdAt, id) cursor isn't enough — rows with different
// ranks need rank DESC ordering first. Cursor encodes (rank, createdAt, id)
// and the WHERE clause uses a row-comparison: `(rank, createdAt, id) <
// (cursor.rank, cursor.createdAt, cursor.id)`.
//
// Caveat: rank is recomputed at query time. If filters change between
// page loads, the same row's rank can shift, and cursors from the prior
// query become semantically meaningless. This is an accepted tradeoff
// for v1 — stable enough for "Load more" within one filter state.

interface ProductCursor {
  rank: number;
  /**
   * Precision (#135): this keys on products.created_at, which is declared
   * timestamp(3) so its stored precision matches the millisecond value carried
   * here — see lib/queries/cursor.ts. If that column's precision ever changes,
   * this keyset would silently skip same-millisecond rows too.
   *
   * Epoch milliseconds. We deliberately don't store an ISO string —
   * round-tripping `Date.toISOString()` (UTC) through Postgres `::timestamp`
   * (which is timestamp-without-time-zone) drops the Z and re-interprets
   * the wall-clock as naive, shifting the value by the local TZ offset.
   * Passing a Date back through the postgres-js driver serializes
   * correctly for the column type without string-parsing.
   */
  createdAtMs: number;
  id: string;
}

function encodeProductCursor(c: ProductCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeProductCursor(raw: string): ProductCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ProductCursor).rank === 'number' &&
      typeof (parsed as ProductCursor).createdAtMs === 'number' &&
      typeof (parsed as ProductCursor).id === 'string'
    ) {
      return parsed as ProductCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS.SSS" using LOCAL-time getters.
 *
 * The products.created_at column is `timestamp without time zone`, and
 * postgres-js reads such values back as Dates whose local-time fields
 * (getFullYear, getMonth, ...) match the wall-clock value Postgres stored.
 * Formatting back via local-time getters and casting to ::timestamp on
 * the SQL side preserves the exact value, with no timezone shift.
 */
function formatNaiveTimestamp(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

// --- Public API -----------------------------------------------------------

export async function searchAll(req: SearchRequest): Promise<SearchResults> {
  const tsQuery = buildTsQuery(req.q);
  if (!tsQuery) {
    return {
      query: req.q,
      artisans: [],
      catalogs: [],
      products: { items: [], nextCursor: null },
      totalProductCount: 0,
    };
  }

  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeProductCursor(req.cursor) : null;

  const [artisans, catalogs, productsPage] = await Promise.all([
    searchArtisans(tsQuery, req.q),
    searchCatalogs(tsQuery),
    searchProducts(tsQuery, req.q, req.filters, cursor, limit),
  ]);

  return {
    query: req.q,
    artisans,
    catalogs,
    products: {
      items: productsPage.items,
      nextCursor: productsPage.nextCursor,
    },
    totalProductCount: productsPage.totalCount,
  };
}

// --- Artisans -------------------------------------------------------------
// FTS @@ on the search_vector OR trigram % on shop_name (typo fallback).
// ts_rank_cd weights position+proximity within the vector.

// Row types include an index signature so they satisfy db.execute's
// generic constraint (`TRow extends Record<string, unknown>`). The result
// IS the row array (drizzle-postgres-js: `RowList<T[]>`), not `{ rows: [] }`.
type ArtisanRow = {
  id: string;
  shop_slug: string;
  shop_name: string;
  bio: string | null;
  location: string | null;
  banner_image_url: string | null;
  rank: number;
} & Record<string, unknown>;

async function searchArtisans(tsQuery: string, rawQuery: string): Promise<ArtisanHit[]> {
  const result = await db.execute<ArtisanRow>(sql`
    SELECT
      a.id,
      a.shop_slug,
      a.shop_name,
      a.bio,
      a.location,
      a.banner_image_url,
      ts_rank_cd(a.search_vector, to_tsquery('english', ${tsQuery})) AS rank
    FROM artisan_profiles a
    WHERE a.search_vector @@ to_tsquery('english', ${tsQuery})
       OR a.shop_name % ${rawQuery}
    ORDER BY rank DESC, a.shop_name ASC
    LIMIT ${ARTISAN_LIMIT}
  `);

  return result.map((r) => ({
    type: 'artisan' as const,
    id: r.id,
    shopSlug: r.shop_slug,
    shopName: r.shop_name,
    bio: r.bio,
    location: r.location,
    bannerImageUrl: r.banner_image_url,
    rank: r.rank,
  }));
}

// --- Catalogs -------------------------------------------------------------
// FTS only — catalogs don't get a trigram index (title is short and
// usually editorially chosen, not user-typed).

type CatalogRow = {
  id: string;
  slug: string;
  title: string;
  artisan_slug: string;
  artisan_name: string;
  rank: number;
} & Record<string, unknown>;

async function searchCatalogs(tsQuery: string): Promise<CatalogHit[]> {
  const result = await db.execute<CatalogRow>(sql`
    SELECT
      c.id,
      c.slug,
      c.title,
      a.shop_slug AS artisan_slug,
      a.shop_name AS artisan_name,
      ts_rank_cd(c.search_vector, to_tsquery('english', ${tsQuery})) AS rank
    FROM catalogs c
    JOIN artisan_profiles a ON a.id = c.artisan_profile_id
    WHERE c.status = 'published'
      AND c.search_vector @@ to_tsquery('english', ${tsQuery})
    ORDER BY rank DESC, c.title ASC
    LIMIT ${CATALOG_LIMIT}
  `);

  return result.map((r) => ({
    type: 'catalog' as const,
    id: r.id,
    slug: r.slug,
    title: r.title,
    artisanSlug: r.artisan_slug,
    artisanName: r.artisan_name,
    rank: r.rank,
  }));
}

// --- Products -------------------------------------------------------------
// Same FTS + trigram-fallback shape as artisans, plus filters and cursor
// pagination ordered by (rank DESC, created_at DESC, id DESC). Window
// function COUNT(*) OVER () returns the unfiltered-page total in the
// same query; cheaper than a separate COUNT round trip.

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  image_url: string | null;
  artisan_profile_id: string;
  artisan_slug: string;
  artisan_name: string;
  rank: number;
  created_at: Date;
  total_count: string;
} & Record<string, unknown>;

async function searchProducts(
  tsQuery: string,
  rawQuery: string,
  filters: ProductFilters | undefined,
  cursor: ProductCursor | null,
  limit: number,
): Promise<{ items: ProductHit[]; nextCursor: string | null; totalCount: number }> {
  const conditions: SQL[] = [
    sql`p.status = 'published'`,
    sql`(p.search_vector @@ to_tsquery('english', ${tsQuery}) OR p.title % ${rawQuery})`,
  ];

  if (filters?.materials && filters.materials.length > 0) {
    // Drizzle's sql tag unpacks JS arrays into separate parameters (for
    // IN-clause expansion), so we can't pass the whole array as one
    // text[] param. Build an ARRAY[...] constructor instead — each
    // element is its own parameter and Postgres builds the array
    // server-side. Safe from injection, matches the GIN materials index.
    const elements = sql.join(
      filters.materials.map((m) => sql`${m}`),
      sql`, `,
    );
    conditions.push(sql`p.materials && ARRAY[${elements}]::text[]`);
  }
  if (filters?.priceMin !== undefined) {
    conditions.push(sql`p.price >= ${filters.priceMin}`);
  }
  if (filters?.priceMax !== undefined) {
    conditions.push(sql`p.price <= ${filters.priceMax}`);
  }
  if (filters?.inStockOnly) {
    conditions.push(sql`p.stock_on_hand > 0`);
  }

  // Keyset cursor on (rank, created_at, id) — Postgres row-comparison
  // gives clean lexicographic semantics for an all-DESC sort. The
  // timestamp string is formatted with local-time getters so the
  // ::timestamp cast lands on the same wall-clock value Postgres stored.
  const whereWithCursor = cursor
    ? sql`${sql.join(conditions, sql` AND `)} AND (
        ts_rank_cd(p.search_vector, to_tsquery('english', ${tsQuery})),
        p.created_at,
        p.id
      ) < (${cursor.rank}, ${formatNaiveTimestamp(new Date(cursor.createdAtMs))}::timestamp, ${cursor.id}::uuid)`
    : sql.join(conditions, sql` AND `);

  const result = await db.execute<ProductRow>(sql`
    SELECT
      p.id,
      p.slug,
      p.title,
      p.price,
      p.currency,
      p.created_at,
      a.id AS artisan_profile_id,
      a.shop_slug AS artisan_slug,
      a.shop_name AS artisan_name,
      ts_rank_cd(p.search_vector, to_tsquery('english', ${tsQuery})) AS rank,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position
        LIMIT 1
      ) AS image_url,
      COUNT(*) OVER () AS total_count
    FROM products p
    JOIN artisan_profiles a ON a.id = p.artisan_profile_id
    WHERE ${whereWithCursor}
    ORDER BY rank DESC, p.created_at DESC, p.id DESC
    LIMIT ${limit + 1}
  `);

  // Drizzle's postgres-js execute returns the row array directly (no
  // .rows wrapper). Slice off the limit+1 sentinel before mapping.
  const hasMore = result.length > limit;
  const visible = hasMore ? result.slice(0, limit) : Array.from(result);

  // Batch-fetch seller reputation for every artisan on this page so
  // product cards can surface "Responds within …" — one aggregate
  // query for the whole page, not one per card.
  const reputations = await getSellerReputationsForArtisans(
    visible.map((r) => r.artisan_profile_id),
  );

  const items: ProductHit[] = visible.map((r) => {
    const bucket = reputations.get(r.artisan_profile_id)?.responseTimeBucket ?? null;
    return {
      type: 'product' as const,
      id: r.id,
      slug: r.slug,
      title: r.title,
      price: r.price,
      currency: r.currency,
      imageUrl: r.image_url,
      artisanSlug: r.artisan_slug,
      artisanName: r.artisan_name,
      responseTimeLabel: bucket ? bucketLabel(bucket) : null,
      rank: r.rank,
    };
  });

  const last = visible[visible.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeProductCursor({
          rank: last.rank,
          createdAtMs: new Date(last.created_at).getTime(),
          id: last.id,
        })
      : null;

  // total_count is bigint — Postgres returns it as a string from the driver.
  const totalCount = result.length > 0 ? Number(result[0]!.total_count) : 0;

  return { items, nextCursor, totalCount };
}

/**
 * Suggestion chips for the search entry/no-results states (T14). Sourced
 * from materials actually on published works, most common first — the
 * product search vector indexes materials at weight B, so every term
 * here is guaranteed to return at least one result. No hardcoded "vase".
 *
 * Cached (E7) with the same `search-facets` tag + 5-min TTL as
 * getAvailableMaterials: this runs an `unnest(materials)` aggregation, and
 * the empty/no-results states rendered it on every request. Product
 * mutations already `revalidateTag(FACET_TAG)`, so new materials surface
 * promptly; the TTL bounds staleness if a write bypasses our actions.
 */
export const getSearchSuggestions = unstable_cache(
  async (limit = 8): Promise<string[]> => {
    const rows = await db.execute<{ material: string }>(sql`
      SELECT m AS material
      FROM (
        SELECT unnest(materials) AS m
        FROM products
        WHERE status = 'published' AND materials IS NOT NULL
      ) t
      GROUP BY m
      ORDER BY count(*) DESC, m ASC
      LIMIT ${limit}
    `);
    return rows.map((r) => r.material);
  },
  ['search-suggestions'],
  { revalidate: 300, tags: [FACET_TAG] },
);
