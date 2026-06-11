import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { getArtistStats } from '@/lib/queries/artist-stats';

export const metadata = {
  title: 'Stats',
};

// Bars only appear once there's something worth charting — below this,
// a near-empty chart would just visualize silence (T11 AC: plain
// numbers until there is enough data).
const CHART_MIN_30D_VIEWS = 14;

const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });

// Owner-only traction dashboard (T11): the private answer to "is anyone
// seeing my work?". requireSellerProfile redirects non-sellers.
export default async function StatsPage() {
  const profile = await requireSellerProfile();
  const stats = await getArtistStats(profile.id, profile.userId);

  const cards = [
    { label: 'Views', total: stats.totals.views, recent: stats.last30d.views },
    { label: 'Followers', total: stats.totals.followers, recent: stats.last30d.followers },
    {
      label: 'Appreciations',
      total: stats.totals.appreciations,
      recent: stats.last30d.appreciations,
    },
    { label: 'Comments', total: stats.totals.comments, recent: stats.last30d.comments },
  ];

  const maxDay = Math.max(...stats.viewsByDay.map((d) => d.views), 1);
  const showChart = stats.last30d.views >= CHART_MIN_30D_VIEWS;
  const firstDay = stats.viewsByDay[0];
  const lastDay = stats.viewsByDay[stats.viewsByDay.length - 1];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Stats</h1>
        <p className="text-muted-foreground">
          How people are finding and responding to your work. Only you can see this.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-normal">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-medium tabular-nums">{c.total.toLocaleString()}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {c.recent === 0 ? 'none in the last 30 days' : `+${c.recent} in the last 30 days`}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Views, last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          {showChart ? (
            <div>
              <div className="flex h-32 items-end gap-[2px]" role="img" aria-label="Daily views">
                {stats.viewsByDay.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.views} ${d.views === 1 ? 'view' : 'views'}`}
                    className="bg-accent/70 min-h-[2px] flex-1 rounded-t-sm"
                    style={{ height: `${Math.round((d.views / maxDay) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                <span>{firstDay && DAY_LABEL.format(new Date(firstDay.day))}</span>
                <span>{lastDay && DAY_LABEL.format(new Date(lastDay.day))}</span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {stats.last30d.views === 0
                ? 'No views yet this month. Share your studio link — every visit lands here.'
                : `${stats.last30d.views} ${stats.last30d.views === 1 ? 'view' : 'views'} so far this month. A daily chart appears once there's more to show.`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
