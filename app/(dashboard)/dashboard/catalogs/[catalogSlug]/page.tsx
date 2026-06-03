import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, products } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogForm } from '@/components/dashboard/catalog-form';
import { CatalogProductList } from '@/components/dashboard/catalog-product-list';
import { CatalogStatusButtons } from '@/components/dashboard/catalog-status-buttons';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Catalog',
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
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard/catalogs" className="hover:underline">
            ← Catalogs
          </Link>
        </p>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl tracking-tight">{catalog.title}</h1>
            <p className="text-muted-foreground text-sm">/{catalog.slug}</p>
          </div>
          <CatalogStatusButtons catalogId={catalog.id} status={catalog.status} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Catalog details</CardTitle>
          <CardDescription>
            Slug is locked once created. To change it, archive and create a new catalog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogForm
            // Remount when the catalog row changes — e.g. after a save's
            // router.refresh() — so the uncontrolled inputs re-initialise with
            // the new defaults instead of warning that defaultValue changed.
            key={catalog.updatedAt.getTime()}
            mode="edit"
            catalogId={catalog.id}
            defaults={{
              title: catalog.title,
              description: catalog.description,
              releaseAt: catalog.releaseAt,
              closesAt: catalog.closesAt,
              isLimitedEdition: catalog.isLimitedEdition,
            }}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl tracking-tight">Products</h2>
          {/* When the catalog is empty the EmptyState below carries the
              "Add a product" CTA — a header button here would duplicate it. */}
          {productList.length > 0 && (
            <Link
              href={`/dashboard/catalogs/${catalog.slug}/products/new`}
              className={buttonVariants({ size: 'sm' })}
            >
              New product
            </Link>
          )}
        </div>
        {productList.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add the first piece in this catalog."
            action={
              <Link
                href={`/dashboard/catalogs/${catalog.slug}/products/new`}
                className={buttonVariants({ size: 'sm' })}
              >
                Add a product
              </Link>
            }
          />
        ) : (
          <CatalogProductList
            catalogSlug={catalog.slug}
            products={productList.map((p) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              price: p.price,
              currency: p.currency,
              stockOnHand: p.stockOnHand,
              status: p.status,
            }))}
            approvalStatus={profile.approvalStatus}
          />
        )}
      </section>
    </div>
  );
}
