import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BecomeSellerForm } from '@/components/dashboard/become-seller-form';
import { getCurrentArtisanProfile, getCurrentSession } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Become a seller · Balikha',
};

export default async function BecomeSellerPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  // If they already have a profile, send them to the seller dashboard.
  const profile = await getCurrentArtisanProfile();
  if (profile) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Open a shop on Balikha</h1>
        <p className="text-muted-foreground text-base">
          Sellers list and manage their work from here. You only need a shop name to start — you can
          add a bio, banner, and other details later from settings.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Shop details</CardTitle>
          <CardDescription>Your shop URL is generated automatically from the name.</CardDescription>
        </CardHeader>
        <CardContent>
          <BecomeSellerForm />
        </CardContent>
      </Card>
    </div>
  );
}
