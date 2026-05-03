import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Force dynamic rendering — this page reads live aggregates over a sliding
// time window, so caching would only ever serve stale data.
export const dynamic = 'force-dynamic';

export default async function AdminSearchAnalyticsPage() {
  const { stats, topQueries, noResultQueries } = await loadAnalytics();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Search analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What buyers are searching for. Data from the last 30 days.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Searches (7d)" value={stats.searches7d.toLocaleString()} />
        <StatCard label="Searches (30d)" value={stats.searches30d.toLocaleString()} />
        <StatCard label="Unique queries (30d)" value={stats.uniqueQueries30d.toLocaleString()} />
        <StatCard
          label="No-result rate"
          value={stats.searches30d > 0 ? `${stats.noResultRate.toFixed(1)}%` : '—'}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Top queries (30 days)</h2>
        <QueryTable
          rows={topQueries}
          columns={[
            { key: 'query', label: 'Query', align: 'left' },
            { key: 'count', label: 'Count', align: 'right' },
            { key: 'avgResults', label: 'Avg results', align: 'right' },
          ]}
          emptyMessage="No searches in the last 30 days yet."
        />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">No-result queries (30 days)</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          What buyers are looking for that we don&rsquo;t have. Leads for new artisans to recruit or
          new product categories to surface.
        </p>
        <QueryTable
          rows={noResultQueries}
          columns={[
            { key: 'query', label: 'Query', align: 'left' },
            { key: 'count', label: 'Count', align: 'right' },
          ]}
          emptyMessage="No zero-result queries — buyers are finding what they're searching for."
        />
      </section>
    </div>
  );
}

// --- Components -----------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

interface QueryRow {
  query: string;
  count: number;
  avgResults?: number;
}

function QueryTable({
  rows,
  columns,
  emptyMessage,
}: {
  rows: QueryRow[];
  columns: { key: keyof QueryRow; label: string; align: 'left' | 'right' }[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-center text-sm">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={`px-4 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.query} className="border-b last:border-0">
                {columns.map((c) => {
                  const v = row[c.key];
                  const display =
                    v === undefined
                      ? '—'
                      : c.key === 'avgResults' && typeof v === 'number'
                        ? v.toFixed(0)
                        : typeof v === 'number'
                          ? v.toLocaleString()
                          : String(v);
                  return (
                    <td
                      key={String(c.key)}
                      className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// --- Data loader ----------------------------------------------------------
//
// Hoisted out of the component body because server components are
// considered render-pure under the React purity rules (react-hooks/purity
// flags `Date.now()` directly in the component). A regular helper function
// is allowed to be impure; the page just awaits it.

async function loadAnalytics() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [stats, topQueries, noResultQueries] = await Promise.all([
    getStats(sevenDaysAgo, thirtyDaysAgo),
    getTopQueries(thirtyDaysAgo),
    getNoResultQueries(thirtyDaysAgo),
  ]);

  return { stats, topQueries, noResultQueries };
}

// --- Aggregate queries ----------------------------------------------------

interface Stats {
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
async function getStats(sevenDaysAgo: Date, thirtyDaysAgo: Date): Promise<Stats> {
  const result = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= ${sevenDaysAgo}) AS searches_7d,
      COUNT(*) FILTER (WHERE created_at >= ${thirtyDaysAgo}) AS searches_30d,
      COUNT(DISTINCT normalized_query) FILTER (WHERE created_at >= ${thirtyDaysAgo}) AS unique_queries_30d,
      COALESCE(
        100.0 * COUNT(*) FILTER (WHERE created_at >= ${thirtyDaysAgo} AND product_result_count = 0)
        / NULLIF(COUNT(*) FILTER (WHERE created_at >= ${thirtyDaysAgo}), 0),
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

async function getTopQueries(thirtyDaysAgo: Date) {
  const result = await db.execute<GroupedRow>(sql`
    SELECT
      normalized_query AS query,
      COUNT(*) AS count,
      AVG(product_result_count)::numeric AS avg_results
    FROM search_events
    WHERE created_at >= ${thirtyDaysAgo}
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

async function getNoResultQueries(thirtyDaysAgo: Date) {
  const result = await db.execute<GroupedRow>(sql`
    SELECT
      normalized_query AS query,
      COUNT(*) AS count
    FROM search_events
    WHERE created_at >= ${thirtyDaysAgo}
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
