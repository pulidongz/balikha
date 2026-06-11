import Link from 'next/link';
import { aliasedTable } from 'drizzle-orm/alias';
import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, commentReports, products, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { ResolveReportButton } from '@/components/admin/resolve-report-button';
import { workPath } from '@/lib/routes';

export const metadata = {
  title: 'Comment Reports — Admin',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Unresolved comment reports (T8). The body shown is the report-time
// snapshot, so it stays reviewable even after the comment was deleted.
export default async function AdminCommentReportsPage() {
  await requireAdmin();

  const reporter = aliasedTable(user, 'reporter');
  const reported = aliasedTable(user, 'reported');

  const reports = await db
    .select({
      id: commentReports.id,
      commentId: commentReports.commentId,
      commentBody: commentReports.commentBody,
      createdAt: commentReports.createdAt,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      reportedName: reported.name,
      reportedEmail: reported.email,
      productTitle: products.title,
      productSlug: products.slug,
      shopSlug: artisanProfiles.shopSlug,
    })
    .from(commentReports)
    .innerJoin(reporter, eq(reporter.id, commentReports.reporterUserId))
    .innerJoin(reported, eq(reported.id, commentReports.reportedUserId))
    .innerJoin(products, eq(products.id, commentReports.productId))
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(isNull(commentReports.resolvedAt))
    .orderBy(desc(commentReports.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Comment reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {reports.length === 0
            ? 'No open reports.'
            : `${reports.length} open ${reports.length === 1 ? 'report' : 'reports'}.`}
        </p>
      </header>

      {reports.length > 0 && (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">{r.reportedName}</span>{' '}
                    <span className="text-muted-foreground">({r.reportedEmail})</span> on{' '}
                    <Link
                      href={workPath(r.shopSlug, r.productSlug)}
                      className="underline underline-offset-4"
                    >
                      {r.productTitle}
                    </Link>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Reported by {r.reporterName} ({r.reporterEmail}) ·{' '}
                    {DATE_FMT.format(r.createdAt)}
                    {r.commentId === null && ' · comment since deleted'}
                  </p>
                </div>
                <ResolveReportButton reportId={r.id} />
              </div>
              <blockquote className="bg-secondary/50 rounded-md p-3 text-sm whitespace-pre-line">
                {r.commentBody}
              </blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
