import Link from 'next/link';
import { count, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { isNull } from 'drizzle-orm';
import { commentReports, orders, searchEvents } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  countActiveSellers30d,
  countTotalProducts,
  countTotalUsers,
  formatRate,
  loadOrderMetrics,
  type OrderMetrics,
} from '@/lib/queries/admin-metrics';
import { getAdminAuditLog } from '@/lib/queries/admin-audit-log';
import { ADMIN_ACTION_PILL, adminActionLabel } from '@/lib/admin/audit-display';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const [
    searchCount7d,
    disputedCountRow,
    openReportsRow,
    totalUsers,
    totalProducts,
    activeSellers30d,
    orderMetrics,
    activityLog,
  ] = await Promise.all([
    loadSearchCount7d(),
    db.select({ value: count() }).from(orders).where(eq(orders.status, 'disputed')),
    db.select({ value: count() }).from(commentReports).where(isNull(commentReports.resolvedAt)),
    countTotalUsers(),
    countTotalProducts(),
    countActiveSellers30d(),
    loadOrderMetrics(),
    getAdminAuditLog(1),
  ]);
  const disputedCount = disputedCountRow[0]?.value ?? 0;
  const openReportsCount = openReportsRow[0]?.value ?? 0;

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
        <StatCard label="Active artists (30d)" value={activeSellers30d} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SearchAnalyticsCard searchCount7d={searchCount7d} />
        <RecentActivityCard
          entries={activityLog.list.slice(0, 6)}
          usersById={activityLog.usersById}
        />
        <DisputesNeedingAttention count={disputedCount} />
        <CommentReportsCard count={openReportsCount} />
        <SalesOverviewCard metrics={orderMetrics} />
        <EditorialFeaturingCard />
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

// Live feed of the most recent admin actions, sourced from the same audit log
// as /admin/audit-log. Replaces the old roadmap placeholder now that disputes,
// seller, comment and editorial actions are all recorded.
function RecentActivityCard({
  entries,
  usersById,
}: {
  entries: { id: string; action: string; actorId: string | null; createdAt: Date }[];
  usersById: Map<string, { name: string; email: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            No admin actions recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => {
              const actor = entry.actorId
                ? (usersById.get(entry.actorId)?.name ?? 'deleted user')
                : 'system';
              return (
                <li key={entry.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      ADMIN_ACTION_PILL[entry.action] ?? 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {adminActionLabel(entry.action)}
                  </span>
                  <span className="text-foreground truncate">{actor}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/admin/audit-log"
          className="text-foreground mt-3 inline-block text-sm underline"
        >
          View audit log →
        </Link>
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

// T15: founder-curated homepage feature — a link card, the editing
// happens on its own page.
function EditorialFeaturingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editorial featuring</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Set the homepage feature: one studio, your words, a row of selected works. Curated, never
          paid.
        </p>
        <Link
          href="/admin/featuring"
          className="text-foreground mt-3 inline-block text-sm underline"
        >
          Edit feature →
        </Link>
      </CardContent>
    </Card>
  );
}

// T8 moderation surface: flagged comments waiting for review.
function CommentReportsCard({ count }: { count: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comment reports</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={count > 0 ? 'text-destructive text-3xl font-medium' : 'text-3xl font-medium'}>
          {count}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {count === 0
            ? 'No flagged comments.'
            : count === 1
              ? 'flagged comment awaiting review'
              : 'flagged comments awaiting review'}
        </p>
        <Link
          href="/admin/comment-reports"
          className="text-foreground mt-3 inline-block text-sm underline"
        >
          Review →
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
