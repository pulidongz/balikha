import Link from 'next/link';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Seller Applications — Admin',
};

const PAGE_SIZE = 100;

type ApprovalFilter = 'pending' | 'approved' | 'rejected';

function parseFilter(raw: string | string[] | undefined): ApprovalFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch (value) {
    case 'approved':
    case 'rejected':
      return value;
    case 'pending':
    case undefined:
    default:
      return 'pending';
  }
}

const TABS: readonly { value: ApprovalFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_PILL: Record<ApprovalFilter, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = parseFilter(params.status);

  const [list, pendingCountRow] = await Promise.all([
    db
      .select({
        id: artisanProfiles.id,
        shopName: artisanProfiles.shopName,
        approvalStatus: artisanProfiles.approvalStatus,
        createdAt: artisanProfiles.createdAt,
        applicantName: user.name,
        applicantEmail: user.email,
      })
      .from(artisanProfiles)
      .innerJoin(user, eq(user.id, artisanProfiles.userId))
      .where(eq(artisanProfiles.approvalStatus, filter))
      .orderBy(desc(artisanProfiles.createdAt))
      .limit(PAGE_SIZE),
    db
      .select({ value: count() })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.approvalStatus, 'pending')),
  ]);

  const pendingCount = pendingCountRow[0]?.value ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Seller Applications</h1>
        <p className="text-muted-foreground text-sm">
          Review incoming seller applications. Pending applications are the priority queue.
        </p>
      </header>

      <nav aria-label="Application filters" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            const showBadge = tab.value === 'pending' && pendingCount > 0;
            const href =
              tab.value === 'pending' ? '/admin/sellers' : `/admin/sellers?status=${tab.value}`;
            return (
              <li key={tab.value}>
                <Link
                  href={href}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'text-foreground border-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  <span>{tab.label}</span>
                  {showBadge && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums',
                        active ? 'bg-foreground text-background' : 'bg-amber-500 text-white',
                      )}
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">No {filter} applications.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/sellers/${a.id}`}
                className="bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-md border p-3 transition-colors sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-foreground font-medium">{a.shopName}</p>
                  <p className="text-muted-foreground text-xs">
                    {a.applicantName} &middot; {a.applicantEmail}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Applied {formatRelativeTime(a.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    'self-start rounded-full px-2.5 py-0.5 text-xs font-medium sm:self-auto',
                    STATUS_PILL[a.approvalStatus],
                  )}
                >
                  {a.approvalStatus.charAt(0).toUpperCase() + a.approvalStatus.slice(1)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
