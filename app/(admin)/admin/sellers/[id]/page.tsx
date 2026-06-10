import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { formatRelativeTime } from '@/lib/format';
import { studioPath } from '@/lib/routes';
import { AdminSellerActions } from '@/components/admin/admin-seller-actions';

export const metadata = { title: 'Artist Application — Admin' };

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const STATUS_PILL: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default async function AdminSellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [row] = await db
    .select({
      profile: artisanProfiles,
      applicantName: user.name,
      applicantEmail: user.email,
    })
    .from(artisanProfiles)
    .innerJoin(user, eq(user.id, artisanProfiles.userId))
    .where(eq(artisanProfiles.id, id))
    .limit(1);

  if (!row) notFound();

  const { profile, applicantName, applicantEmail } = row;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/sellers" className="hover:underline">
            ← All applications
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-medium">{profile.shopName}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[profile.approvalStatus]}`}
          >
            {profile.approvalStatus.charAt(0).toUpperCase() + profile.approvalStatus.slice(1)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          Applied {formatRelativeTime(profile.createdAt)}
        </p>
      </header>

      <AdminSellerActions artisanProfileId={profile.id} approvalStatus={profile.approvalStatus} />

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Applicant
        </h2>
        <div className="mt-3 text-sm">
          <p className="text-foreground font-medium">{applicantName}</p>
          <p className="text-muted-foreground text-xs">{applicantEmail}</p>
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Studio details
        </h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div className="text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase">Studio name</p>
            <p className="text-foreground mt-1">{profile.shopName}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase">Studio URL</p>
            <p className="text-foreground mt-1 font-mono text-xs">{studioPath(profile.shopSlug)}</p>
          </div>
          {profile.location && (
            <div className="text-sm">
              <p className="text-muted-foreground text-xs font-medium uppercase">Location</p>
              <p className="text-foreground mt-1">{profile.location}</p>
            </div>
          )}
        </div>
      </section>

      {profile.bio && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Bio</h2>
          <p className="mt-3 text-sm whitespace-pre-line">{profile.bio}</p>
        </section>
      )}

      {profile.policies && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Shop policies
          </h2>
          <p className="mt-3 text-sm whitespace-pre-line">{profile.policies}</p>
        </section>
      )}

      {profile.approvalNote && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Rejection note (applicant-facing)
          </h2>
          <p className="mt-3 text-sm whitespace-pre-line">{profile.approvalNote}</p>
        </section>
      )}

      {profile.reviewedAt && (
        <section className="border-t pt-6">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Review history
          </h2>
          <p className="text-muted-foreground mt-3 text-sm">
            Last reviewed {DATE_FMT.format(profile.reviewedAt)}
          </p>
        </section>
      )}
    </div>
  );
}
