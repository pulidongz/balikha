import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, products } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogForm } from '@/components/dashboard/catalog-form';
import { CatalogStatusButtons } from '@/components/dashboard/catalog-status-buttons';

export const metadata = {
  title: 'Catalog · Balikha',
};

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ catalogSlug: string }>;
}) {
  const { catalogSlug } = await params;
  const profile = await requireSellerProfile();

  const [catalog] = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, catalogSlug)))
    .limit(1);

  if (!catalog) notFound();

  const productList = await db
    .select()
    .from(products)
    .where(eq(products.catalogId, catalog.id))
    .orderBy(desc(products.createdAt));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard/catalogs" className="hover:underline">
            ← Catalogs
          </Link>
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{catalog.title}</h1>
            <p className="text-muted-foreground text-sm">/{catalog.slug}</p>
          </div>
          <CatalogStatusButtons catalogId={catalog.id} status={catalog.status} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Catalog details</CardTitle>
          <CardDescription>
            Slug is locked once created. To change it, archive and create a new catalog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogForm
            mode="edit"
            catalogId={catalog.id}
            defaults={{
              title: catalog.title,
              description: catalog.description,
              releaseAt: catalog.releaseAt,
              closesAt: catalog.closesAt,
            }}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Products</h2>
          <Link
            href={`/dashboard/catalogs/${catalog.slug}/products/new`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm"
          >
            New product
          </Link>
        </div>
        {productList.length === 0 ? (
          <p className="text-muted-foreground text-sm">No products yet.</p>
        ) : (
          <ul className="space-y-3">
            {productList.map((p) => (
              <li key={p.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">
                      <Link
                        href={`/dashboard/catalogs/${catalog.slug}/products/${p.slug}`}
                        className="hover:underline"
                      >
                        {p.title}
                      </Link>
                    </h3>
                    <p className="text-muted-foreground text-xs">/{p.slug}</p>
                    <p className="mt-1 text-sm">
                      {formatPrice(p.price, p.currency)} · stock {p.stockOnHand}
                    </p>
                  </div>
                  <span className="text-muted-foreground rounded border px-2 py-0.5 text-xs">
                    {p.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
