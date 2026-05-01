import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentArtisanProfile, getCurrentSession } from '@/lib/auth-helpers';
import { DashboardHeaderMenu } from './dashboard-header-menu';

export async function DashboardHeader() {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');
  const profile = await getCurrentArtisanProfile();

  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="font-serif text-lg tracking-tight">
          Balikha
        </Link>
        <DashboardHeaderMenu
          userName={session.user.name}
          userEmail={session.user.email}
          shopSlug={profile?.shopSlug ?? null}
        />
      </div>
    </header>
  );
}
