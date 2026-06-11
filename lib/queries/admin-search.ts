import { sql } from 'drizzle-orm';
import { db } from '@/db';

// Search-analytics aggregates for /admin/search. Each query's time window
// is computed in SQL (LOCALTIMESTAMP - INTERVAL), so there's no Date.now()
// for react-hooks/purity to flag and no Date parameter to bind.

export interface SearchStats {
  searches7d: number;
  searches30d: number;
  uniqueQueries30d: number;
  /** 0–100 percentage of 30-day searches with zero product results. */
  noResultRate: number;
}

type StatsRow = {
  searches_7d: string;
  searches_30d: string;
  unique_queries_30d: string;
  no_result_rate: string | null;
} & Record<string, unknown>;

// One query, conditional aggregates via FILTER (WHERE ...). Cheaper than
// four separate round trips for the same scan.
async function getStats(): Promise<SearchStats> {
  const result = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '7 days') AS searches_7d,
      COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days') AS searches_30d,
      COUNT(DISTINCT normalized_query) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days') AS unique_queries_30d,
      COALESCE(
        100.0 * COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days' AND product_result_count = 0)
        / NULLIF(COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days'), 0),
        0
      ) AS no_result_rate
    FROM search_events
  `);
  const row = result[0];
  if (!row) {
    return { searches7d: 0, searches30d: 0, uniqueQueries30d: 0, noResultRate: 0 };
  }
  return {
    // COUNT/AVG return bigint/numeric — driver hands them back as strings.
    searches7d: Number(row.searches_7d),
    searches30d: Number(row.searches_30d),
    uniqueQueries30d: Number(row.unique_queries_30d),
    noResultRate: Number(row.no_result_rate ?? 0),
  };
}

type GroupedRow = {
  query: string;
  count: string;
  avg_results: string | null;
} & Record<string, unknown>;

async function getTopQueries() {
  const result = await db.execute<GroupedRow>(sql`
    SELECT
      normalized_query AS query,
      COUNT(*) AS count,
      AVG(product_result_count)::numeric AS avg_results
    FROM search_events
    WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days'
    GROUP BY normalized_query
    ORDER BY count DESC, normalized_query ASC
    LIMIT 25
  `);
  return Array.from(result, (r) => ({
    query: r.query,
    count: Number(r.count),
    avgResults: r.avg_results === null ? 0 : Number(r.avg_results),
  }));
}

async function getNoResultQueries() {
  const result = await db.execute<GroupedRow>(sql`
    SELECT
      normalized_query AS query,
      COUNT(*) AS count
    FROM search_events
    WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days'
      AND product_result_count = 0
    GROUP BY normalized_query
    ORDER BY count DESC, normalized_query ASC
    LIMIT 25
  `);
  return Array.from(result, (r) => ({
    query: r.query,
    count: Number(r.count),
  }));
}

export async function loadSearchAnalytics() {
  const [stats, topQueries, noResultQueries] = await Promise.all([
    getStats(),
    getTopQueries(),
    getNoResultQueries(),
  ]);

  return { stats, topQueries, noResultQueries };
}
