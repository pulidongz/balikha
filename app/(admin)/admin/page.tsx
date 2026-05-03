import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// The four placeholder panels intentionally name the four most-likely upcoming
// admin features. They double as a roadmap and as slot markers — when search
// ships, that plan replaces the search panel; when audit logging lands, that
// plan replaces the activity panel; etc.
export default function AdminOverview() {
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
        <PlaceholderPanel
          title="Search analytics"
          description="Top queries, no-result queries, and click-through behavior will appear here once search ships."
        />
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
