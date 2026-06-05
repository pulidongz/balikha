import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { deriveStatus, STATUS_PILL, ROLE_PILL } from '@/lib/admin/user-status';
import { AdminUserActions } from '@/components/admin/admin-user-actions';

export const metadata = { title: 'User — Admin' };

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const now = new Date();

  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      artisanProfileId: artisanProfiles.id,
      shopName: artisanProfiles.shopName,
      shopSlug: artisanProfiles.shopSlug,
      approvalStatus: artisanProfiles.approvalStatus,
    })
    .from(user)
    .leftJoin(artisanProfiles, eq(artisanProfiles.userId, user.id))
    .where(eq(user.id, id))
    .limit(1);

  if (!row) notFound();

  const status = deriveStatus(row.banned, row.banExpires, now);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/users" className="hover:underline">
            ← All users
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-medium">{row.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_PILL[row.role] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {row.role}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">{row.email}</p>
      </header>

      {/* Action island */}
      <AdminUserActions userId={row.id} status={status} role={row.role} />

      {/* Account details */}
      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Account
        </h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">User ID</dt>
            <dd className="text-foreground mt-1 font-mono text-xs">{row.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Email verified</dt>
            <dd className="text-foreground mt-1">{row.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Joined</dt>
            <dd className="text-foreground mt-1">{DATE_FMT.format(row.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Last updated</dt>
            <dd className="text-foreground mt-1">{DATE_FMT.format(row.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      {/* Ban details — only shown when blocked */}
      {row.banned && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Block details
          </h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            {row.banReason && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs font-medium uppercase">Reason</dt>
                <dd className="text-foreground mt-1 whitespace-pre-line">{row.banReason}</dd>
              </div>
            )}
            {row.banExpires && (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase">
                  Suspension expires
                </dt>
                <dd className="text-foreground mt-1">{DATE_FMT.format(row.banExpires)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Seller details — only shown when the user is a seller */}
      {row.artisanProfileId && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Seller profile
          </h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">Shop name</dt>
              <dd className="text-foreground mt-1">{row.shopName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">Shop URL</dt>
              <dd className="text-foreground mt-1 font-mono text-xs">/shop/{row.shopSlug}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">
                Application status
              </dt>
              <dd className="text-foreground mt-1">{row.approvalStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">
                Seller profile
              </dt>
              <dd className="mt-1">
                <Link
                  href={`/admin/sellers/${row.artisanProfileId}`}
                  className="text-primary text-xs hover:underline"
                >
                  View in Sellers →
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
