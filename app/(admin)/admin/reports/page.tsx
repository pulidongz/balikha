import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-helpers';
import { getOpenReports } from '@/lib/queries/messaging';
import { formatRelativeTime } from '@/lib/format';

export const metadata = { title: 'Reports — Admin' };

export default async function AdminReportsPage() {
  await requireAdmin();
  const reports = await getOpenReports();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">User-reported messages awaiting review.</p>
      </header>
      {reports.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">No open reports.</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.reportId}>
              <Link
                href={`/admin/reports/${r.reportId}`}
                className="bg-card hover:bg-secondary/40 flex flex-col gap-2 rounded-md border p-3 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-foreground font-medium">Reported by {r.reporterName}</p>
                  <p className="text-muted-foreground shrink-0 text-xs">
                    {formatRelativeTime(r.createdAt)}
                  </p>
                </div>
                {r.reason && (
                  <p className="text-muted-foreground line-clamp-2 text-xs">Reason: {r.reason}</p>
                )}
                <p className="text-foreground line-clamp-2 text-sm">
                  {r.messageSenderRole === 'buyer' ? 'Buyer' : 'Seller'}: {r.messageBody}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
