import Link from 'next/link';
import { count, gte } from 'drizzle-orm';
import { db } from '@/db';
import { searchEvents } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// The remaining placeholder panels intentionally name the three most-likely
// upcoming admin features. They double as a roadmap and as slot markers —
// when audit logging lands, that plan replaces the activity panel; when
// reporting ships, the moderation panel; etc. Search analytics shipped in
// the search plan, so its placeholder is now a real summary linking to the
// dedicated page.
export default async function AdminOverview() {
  const searchCount7d = await loadSearchCount7d();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Admin overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Operational health and tools for the marketplace.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Users" />
        <StatCard label="Products" />
        <StatCard label="Active sellers (30d)" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SearchAnalyticsCard searchCount7d={searchCount7d} />
        <PlaceholderPanel
          title="Recent activity"
          description="An audit log of meaningful marketplace events will appear here once event logging is wired in."
        />
        <PlaceholderPanel
          title="Reported content"
          description="Listings flagged by buyers and items needing moderation will appear here once reporting ships."
        />
        <PlaceholderPanel
          title="Sales overview"
          description="Order volume, revenue, and conversion data will appear here once payments ship."
        />
      </section>
    </div>
  );
}

// Em-dash, not "0" or "N/A" — a zero looks like a real metric reading zero;
// the em-dash is unmistakably a placeholder for a metric that doesn't exist
// yet. Don't change this without changing the meaning.
function StatCard({ label }: { label: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-medium">—</p>
        <p className="text-muted-foreground mt-1 text-xs">No data yet</p>
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
