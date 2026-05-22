import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getCurrentArtisanProfile,
  getCurrentSession,
  getCurrentUserWithRole,
} from '@/lib/auth-helpers';
import { DashboardHeaderMenu } from './dashboard-header-menu';

export async function DashboardHeader({
  pendingOrdersCount,
  unreadMessagesCount,
}: {
  pendingOrdersCount: number;
  unreadMessagesCount: number;
}) {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');
  // Both PK lookups in parallel — same pattern as SiteHeader.
  const [profile, userWithRole] = await Promise.all([
    getCurrentArtisanProfile(),
    getCurrentUserWithRole(),
  ]);

  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href={profile ? '/dashboard' : '/'} className="font-serif text-lg tracking-tight">
          Balikha
        </Link>
        <DashboardHeaderMenu
          userName={session.user.name}
          userEmail={session.user.email}
          shopSlug={profile?.shopSlug ?? null}
          isAdmin={userWithRole?.isAdmin ?? false}
          pendingOrdersCount={pendingOrdersCount}
          unreadMessagesCount={unreadMessagesCount}
        />
      </div>
    </header>
  );
}
