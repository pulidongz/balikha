import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-helpers';
import { deriveStatus, STATUS_PILL, ROLE_PILL } from '@/lib/admin/user-status';
import { formatRelativeTime } from '@/lib/format';
import { parsePageParam, parseSearchParam } from '@/lib/queries/admin-params';
import {
  getAdminUsers,
  parseUserRoleFilter,
  parseUserStatusFilter,
} from '@/lib/queries/admin-users';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Users — Admin',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const FILTER_SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    role?: string | string[];
    status?: string | string[];
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = parseSearchParam(params.q);
  const page = parsePageParam(params.page);
  const role = parseUserRoleFilter(params.role);
  const status = parseUserStatusFilter(params.status);
  const now = new Date();

  const { list, total, totalPages } = await getAdminUsers({ search, page, role, status, now });

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set('q', search);
    if (role !== 'all') sp.set('role', role);
    if (status !== 'all') sp.set('status', status);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return `/admin/users${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Manage user accounts. Suspend, ban, promote, or demote from the detail page.
        </p>
      </header>

      {/* Search + filters — one GET form, the Search button applies all three. */}
      <form method="get" action="/admin/users" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by name or email…"
          className="border-input bg-background focus-visible:ring-ring min-w-[12rem] flex-1 rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <select
          name="role"
          defaultValue={role}
          aria-label="Filter by role"
          className={FILTER_SELECT_CLASS}
        >
          <option value="all">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          aria-label="Filter by status"
          className={FILTER_SELECT_CLASS}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {/* Summary */}
      <p className="text-muted-foreground text-xs">
        {total} {total === 1 ? 'user' : 'users'}
        {search ? ` matching "${search}"` : ''}
        {role !== 'all' ? ` · ${role}` : ''}
        {status !== 'all' ? ` · ${status}` : ''}
        {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
      </p>

      {list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          No users found{search ? ` for "${search}"` : ''}.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((u) => {
            const status = deriveStatus(u.banned, u.banExpires, now);
            return (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-md border p-3 transition-colors sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-foreground font-medium">{u.name}</p>
                    <p className="text-muted-foreground text-xs">{u.email}</p>
                    <p className="text-muted-foreground text-xs">
                      Joined{' '}
                      <time
                        dateTime={u.createdAt.toISOString()}
                        title={DATE_FMT.format(u.createdAt)}
                      >
                        {formatRelativeTime(u.createdAt)}
                      </time>
                      {u.isArtisan ? ' · artist' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_PILL[status],
                      )}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        ROLE_PILL[u.role] ?? 'bg-gray-100 text-gray-700',
                      )}
                    >
                      {u.role}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
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
