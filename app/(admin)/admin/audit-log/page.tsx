import Link from 'next/link';
import { count, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { adminActions, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Audit Log — Admin',
};

const PAGE_SIZE = 50;

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const ACTION_PILL: Record<string, string> = {
  suspend: 'bg-amber-100 text-amber-800',
  unsuspend: 'bg-green-100 text-green-800',
  ban: 'bg-red-100 text-red-800',
  unban: 'bg-green-100 text-green-800',
  promote_admin: 'bg-purple-100 text-purple-800',
  demote_admin: 'bg-gray-100 text-gray-700',
};

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;

  const [list, totalRow] = await Promise.all([
    db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        reason: adminActions.reason,
        createdAt: adminActions.createdAt,
        actorId: adminActions.actorUserId,
        targetId: adminActions.targetUserId,
      })
      .from(adminActions)
      .orderBy(desc(adminActions.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(adminActions),
  ]);

  // Collect all referenced user ids and resolve names + emails in one query.
  const allUserIds = Array.from(
    new Set(list.flatMap((r) => [r.actorId, r.targetId]).filter((id): id is string => id !== null)),
  );

  const userNameMap = new Map<string, string>();
  const userEmailMap = new Map<string, string>();

  if (allUserIds.length > 0) {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, allUserIds));
    for (const u of users) {
      userNameMap.set(u.id, u.name);
      userEmailMap.set(u.id, u.email);
    }
  }

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    if (p <= 1) return '/admin/audit-log';
    return `/admin/audit-log?page=${p}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Read-only record of every admin action. Reverse-chronological.
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
              ? (userNameMap.get(entry.actorId) ?? 'deleted user')
              : 'system';
            const actorEmail = entry.actorId ? (userEmailMap.get(entry.actorId) ?? '') : '';
            const targetName = entry.targetId
              ? (userNameMap.get(entry.targetId) ?? 'deleted user')
              : '—';
            const targetEmail = entry.targetId ? (userEmailMap.get(entry.targetId) ?? '') : '';
            return (
              <li
                key={entry.id}
                className="bg-card flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:gap-6"
              >
                <div className="shrink-0">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      ACTION_PILL[entry.action] ?? 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {entry.action.replace('_', ' ')}
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
