import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BannerUploader } from '@/components/dashboard/banner-uploader';
import { SettingsForm } from '@/components/dashboard/settings-form';
import { requireSellerProfile } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Shop settings',
};

export default async function SettingsPage() {
  const profile = await requireSellerProfile();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Shop settings</h1>
        <p className="text-muted-foreground">
          These are the public details on your shop page —{' '}
          <Link
            href={`/shop/${profile.shopSlug}`}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            view it
          </Link>
          .
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Profile</CardTitle>
          <CardDescription>
            Public information that appears on your storefront and product pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            defaults={{
              shopSlug: profile.shopSlug,
              shopName: profile.shopName,
              bio: profile.bio,
              location: profile.location,
              policies: profile.policies,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Banner image</CardTitle>
          <CardDescription>Hero image at the top of your public storefront.</CardDescription>
        </CardHeader>
        <CardContent>
          <BannerUploader currentUrl={profile.bannerImageUrl} />
        </CardContent>
      </Card>
    </div>
  );
}
