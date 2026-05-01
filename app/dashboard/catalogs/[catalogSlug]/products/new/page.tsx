import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductForm } from '@/components/dashboard/product-form';

export const metadata = {
  title: 'New product · Balikha',
};

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ catalogSlug: string }>;
}) {
  const { catalogSlug } = await params;
  const profile = await requireSellerProfile();

  const [catalog] = await db
    .select({ id: catalogs.id, title: catalogs.title, slug: catalogs.slug })
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, catalogSlug)))
    .limit(1);

  if (!catalog) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href={`/dashboard/catalogs/${catalog.slug}`} className="hover:underline">
            ← {catalog.title}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New product</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>Add images on the product page after it&apos;s created.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm mode="create" catalogId={catalog.id} />
        </CardContent>
      </Card>
    </main>
  );
}
