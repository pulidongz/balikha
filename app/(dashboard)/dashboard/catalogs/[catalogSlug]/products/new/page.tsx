import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductForm } from '@/components/dashboard/product-form';

export const metadata = {
  title: 'New product',
};

export default async function NewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalogSlug: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { catalogSlug } = await params;
  const { onboarding } = await searchParams;
  // Ephemeral marker set by the become-seller flow. Not persisted — the intro
  // is a one-time "your shop is live" moment, not a recurring banner.
  const isOnboarding = onboarding === '1';
  const profile = await requireSellerProfile();

  const [catalog] = await db
    .select({ id: catalogs.id, title: catalogs.title, slug: catalogs.slug })
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, catalogSlug)))
    .limit(1);

  if (!catalog) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      {isOnboarding ? (
        <header className="space-y-2">
          <h1 className="font-serif text-2xl tracking-tight">{profile.shopName} is live</h1>
          <p className="text-muted-foreground text-sm">
            Add your first piece below — you can do this anytime from your dashboard.{' '}
            <Link href="/dashboard" className="text-foreground hover:underline">
              Skip for now → your dashboard
            </Link>
          </p>
        </header>
      ) : (
        <header>
          <p className="text-muted-foreground text-sm">
            <Link href={`/dashboard/catalogs/${catalog.slug}`} className="hover:underline">
              ← {catalog.title}
            </Link>
          </p>
          <h1 className="mt-2 font-serif text-2xl tracking-tight">New product</h1>
        </header>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>Add images on the product page after it&apos;s created.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm mode="create" catalogId={catalog.id} catalogSlug={catalog.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
