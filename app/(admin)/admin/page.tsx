import Link from 'next/link';
import { count, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { orders, searchEvents } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  countActiveSellers30d,
  countTotalProducts,
  countTotalUsers,
  formatRate,
  loadOrderMetrics,
  type OrderMetrics,
} from '@/lib/queries/admin-metrics';

// The remaining placeholder panel intentionally names the most-likely upcoming
// admin feature. It doubles as a roadmap and as a slot marker — when audit
// logging lands, that plan replaces the activity panel. Search analytics and
// disputes shipped already; sales overview now shows live order data.
export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const [
    searchCount7d,
    disputedCountRow,
    totalUsers,
    totalProducts,
    activeSellers30d,
    orderMetrics,
  ] = await Promise.all([
    loadSearchCount7d(),
    db.select({ value: count() }).from(orders).where(eq(orders.status, 'disputed')),
    countTotalUsers(),
    countTotalProducts(),
    countActiveSellers30d(),
    loadOrderMetrics(),
  ]);
  const disputedCount = disputedCountRow[0]?.value ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Admin overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Operational health and tools for the marketplace.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Products" value={totalProducts} />
        <StatCard label="Active sellers (30d)" value={activeSellers30d} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SearchAnalyticsCard searchCount7d={searchCount7d} />
        <PlaceholderPanel
          title="Recent activity"
          description="An audit log of meaningful marketplace events will appear here once event logging is wired in."
        />
        <DisputesNeedingAttention count={disputedCount} />
        <SalesOverviewCard metrics={orderMetrics} />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-medium">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function SearchAnalyticsCard({ searchCount7d }: { searchCount7d: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Search analytics</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-medium">{searchCount7d.toLocaleString()}</p>
        <p className="text-muted-foreground mt-1 text-xs">searches in the last 7 days</p>
        <Link href="/admin/search" className="text-foreground mt-3 inline-block text-sm underline">
          View details →
        </Link>
      </CardContent>
    </Card>
  );
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

// Hoisted out of the component body so the impure `Date.now()` doesn't
// trip the react-hooks/purity rule.
//
// Uses Drizzle's typed builder — the previous raw `sql` template passed
// a Date object straight into postgres-js, which only accepts strings
// for timestamp params and threw "Received an instance of Date". The
// typed builder serializes via the column's data type metadata.
async function loadSearchCount7d(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(searchEvents)
    .where(gte(searchEvents.createdAt, sevenDaysAgo));
  return row?.value ?? 0;
}

// Replaces the "Reported content" roadmap placeholder. Surfaces the
// count of disputed orders + a link into the filtered admin orders
// list. Even at zero, the panel signals "this is the moderation
// surface" rather than disappearing.
function DisputesNeedingAttention({ count }: { count: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disputes needing attention</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={count > 0 ? 'text-destructive text-3xl font-medium' : 'text-3xl font-medium'}>
          {count}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {count === 0
            ? 'No active disputes — quiet day.'
            : count === 1
              ? 'order awaiting admin resolution'
              : 'orders awaiting admin resolution'}
        </p>
        <Link href="/admin/orders" className="text-foreground mt-3 inline-block text-sm underline">
          View queue →
        </Link>
      </CardContent>
    </Card>
  );
}

function SalesOverviewCard({ metrics }: { metrics: OrderMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sales overview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-medium">{metrics.volume.toLocaleString()}</p>
        <p className="text-muted-foreground mt-1 text-xs">orders placed (all time)</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Completion</dt>
            <dd className="font-medium">{formatRate(metrics.completionRate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Declined</dt>
            <dd className="font-medium">{formatRate(metrics.declineRate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">No response</dt>
            <dd className="font-medium">{formatRate(metrics.noResponseRate)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
