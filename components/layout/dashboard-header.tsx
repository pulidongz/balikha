import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentArtisanProfile, getCurrentSession } from '@/lib/auth-helpers';
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
  // `role` is on the session (admin plugin, ticket #26) — no DB re-fetch.
  const profile = await getCurrentArtisanProfile();

  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Balikha
        </Link>
        <DashboardHeaderMenu
          userName={session.user.name}
          userEmail={session.user.email}
          shopSlug={profile?.shopSlug ?? null}
          role={session.user.role}
          pendingOrdersCount={pendingOrdersCount}
          unreadMessagesCount={unreadMessagesCount}
        />
      </div>
    </header>
  );
}
