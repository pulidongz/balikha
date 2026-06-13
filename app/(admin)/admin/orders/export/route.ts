import { tryRequireAdmin } from '@/lib/auth-helpers';
import { parseSearchParam } from '@/lib/queries/admin-params';
import {
  ADMIN_ORDERS_EXPORT_MAX,
  getAdminOrdersForExport,
  parseOrderFilter,
} from '@/lib/queries/admin-orders';
import { formatPrice } from '@/lib/format';
import { toCsv } from '@/lib/admin/csv';
import { getRequestLogger } from '@/lib/logger-context';

// CSV export of the orders list, honouring the same status tab + search as the
// page. Guarded with tryRequireAdmin() + 403 because route handlers aren't
// wrapped by the (admin) layout.
export async function GET(request: Request) {
  const admin = await tryRequireAdmin();
  if (!admin) return new Response('Forbidden', { status: 403 });

  const url = new URL(request.url);
  const filter = parseOrderFilter(url.searchParams.get('status') ?? undefined);
  const search = parseSearchParam(url.searchParams.get('q') ?? undefined);

  const rows = await getAdminOrdersForExport({ filter, search });

  if (rows.length >= ADMIN_ORDERS_EXPORT_MAX) {
    const log = await getRequestLogger();
    log.warn(
      { adminId: admin.id, cap: ADMIN_ORDERS_EXPORT_MAX },
      'orders CSV export hit the row cap — output is truncated',
    );
  }

  const csv = toCsv(
    ['Reference', 'Status', 'Product', 'Price', 'Placed', 'Buyer email', 'Studio'],
    rows.map((o) => [
      o.reference,
      o.status,
      o.productTitleSnapshot,
      formatPrice(o.priceSnapshot, o.currency),
      o.placedAt.toISOString(),
      o.buyerEmail,
      o.studioName,
    ]),
  );

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${today}.csv"`,
    },
  });
}
