import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const firstName = session.user.name.split(' ')[0] ?? session.user.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 space-y-1">
        <h1 className="font-serif text-3xl tracking-tight">Welcome back, {firstName}</h1>
        <p className="text-muted-foreground text-sm">
          {profile ? `Managing ${profile.shopName}.` : 'Open a shop to start listing your work.'}
        </p>
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
    </div>
  );
}
