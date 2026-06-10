import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BecomeSellerForm } from '@/components/dashboard/become-seller-form';
import { getCurrentArtisanProfile, requireVerifiedEmail } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Open a studio',
};

export default async function BecomeSellerPage() {
  await requireVerifiedEmail();

  // If they already have a profile, send them to the seller dashboard.
  const profile = await getCurrentArtisanProfile();
  if (profile) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Open a studio on Balikha</h1>
        <p className="text-muted-foreground text-base">
          Artists share and manage their work from here — and sell it if they want to. You only need
          a studio name to start; a bio, banner, and other details can come later from settings.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Studio details</CardTitle>
          <CardDescription>
            Your studio URL is generated automatically from the name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BecomeSellerForm />
        </CardContent>
      </Card>
    </div>
  );
}
