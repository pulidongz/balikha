import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminAuditLog } from '@/lib/queries/admin-audit-log';
import { parsePageParam } from '@/lib/queries/admin-params';
import {
  ADMIN_ACTION_PILL,
  adminActionLabel,
  metadataOrderId,
  metadataReference,
} from '@/lib/admin/audit-display';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Audit Log — Admin',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = parsePageParam(params.page);

  const { list, total, totalPages, usersById } = await getAdminAuditLog(page);

  function pageHref(p: number) {
    if (p <= 1) return '/admin/audit-log';
    return `/admin/audit-log?page=${p}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Read-only record of every admin action — moderation, disputes, seller decisions, and
          curation. Reverse-chronological.
        </p>
      </header>

      <p className="text-muted-foreground text-xs">
        {total} {total === 1 ? 'entry' : 'entries'}
        {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
      </p>

      {list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">No audit entries yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((entry) => {
            const actorName = entry.actorId
              ? (usersById.get(entry.actorId)?.name ?? 'deleted user')
              : 'system';
            const actorEmail = entry.actorId ? (usersById.get(entry.actorId)?.email ?? '') : '';
            const targetName = entry.targetId
              ? (usersById.get(entry.targetId)?.name ?? 'deleted user')
              : '—';
            const targetEmail = entry.targetId ? (usersById.get(entry.targetId)?.email ?? '') : '';
            return (
              <li
                key={entry.id}
                className="bg-card flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:gap-6"
              >
                <div className="shrink-0">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      ADMIN_ACTION_PILL[entry.action] ?? 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {adminActionLabel(entry.action)}
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-foreground">
                    <span className="font-medium">{actorName}</span>
                    {actorEmail && (
                      <span className="text-muted-foreground ml-1 text-xs">{actorEmail}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Target:{' '}
                    {entry.targetId ? (
                      <Link href={`/admin/users/${entry.targetId}`} className="hover:underline">
                        {targetName}
                        {targetEmail && ` (${targetEmail})`}
                      </Link>
                    ) : metadataOrderId(entry.metadata) ? (
                      <Link
                        href={`/admin/orders/${metadataOrderId(entry.metadata)}`}
                        className="hover:underline"
                      >
                        {metadataReference(entry.metadata) ?? 'Order'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </p>
                  {entry.reason && (
                    <p className="text-muted-foreground text-xs">Reason: {entry.reason}</p>
                  )}
                </div>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="text-muted-foreground shrink-0 text-xs"
                >
                  {DATE_FMT.format(entry.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-xs">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
