import { tryRequireAdmin } from '@/lib/auth-helpers';
import { parseSearchParam } from '@/lib/queries/admin-params';
import {
  ADMIN_USERS_EXPORT_MAX,
  getAdminUsersForExport,
  parseUserRoleFilter,
  parseUserStatusFilter,
} from '@/lib/queries/admin-users';
import { deriveStatus } from '@/lib/admin/user-status';
import { toCsv } from '@/lib/admin/csv';
import { getRequestLogger } from '@/lib/logger-context';

// CSV export of the users list, honouring the same q/role/status filters as the
// page. Route handlers are NOT wrapped by the (admin) layout, so this guards
// with tryRequireAdmin() and returns 403 directly rather than relying on the
// layout redirect.
export async function GET(request: Request) {
  const admin = await tryRequireAdmin();
  if (!admin) return new Response('Forbidden', { status: 403 });

  const url = new URL(request.url);
  const search = parseSearchParam(url.searchParams.get('q') ?? undefined);
  const role = parseUserRoleFilter(url.searchParams.get('role') ?? undefined);
  const status = parseUserStatusFilter(url.searchParams.get('status') ?? undefined);
  const now = new Date();

  const rows = await getAdminUsersForExport({ search, role, status, now });

  if (rows.length >= ADMIN_USERS_EXPORT_MAX) {
    const log = await getRequestLogger();
    log.warn(
      { adminId: admin.id, cap: ADMIN_USERS_EXPORT_MAX },
      'users CSV export hit the row cap — output is truncated',
    );
  }

  const csv = toCsv(
    ['ID', 'Name', 'Email', 'Role', 'Status', 'Joined'],
    rows.map((u) => [
      u.id,
      u.name,
      u.email,
      u.role,
      deriveStatus(u.banned, u.banExpires, now),
      u.createdAt.toISOString(),
    ]),
  );

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="users-${now.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
