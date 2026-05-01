import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { BecomeSellerForm } from '@/components/dashboard/become-seller-form';
import { SellerOverview } from '@/components/dashboard/seller-overview';
import { getCurrentSession, getCurrentArtisanProfile } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Dashboard · Balikha',
};

export default async function DashboardPage() {
  const session = await getCurrentSession();
  // Middleware should prevent unauthenticated requests, but double-check
  // server-side in case middleware is bypassed (e.g. RSC client navigation).
  if (!session) {
    redirect('/sign-in');
  }

  const profile = await getCurrentArtisanProfile();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {session.user.name} ({session.user.email})
          </p>
        </div>
        <SignOutButton />
      </header>

      {profile ? (
        <SellerOverview profile={profile} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Become a seller</CardTitle>
            <CardDescription>
              Open a shop on Balikha to start listing your work. You can browse without one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BecomeSellerForm />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
