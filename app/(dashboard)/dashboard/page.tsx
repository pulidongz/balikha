import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, productImages, products } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/marketplace/empty-state';
import { PriceTag } from '@/components/marketplace/price-tag';
import { getCurrentArtisanProfile, getCurrentSession } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Dashboard · Balikha',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  published: 'default',
  sold_out: 'secondary',
  archived: 'secondary',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  sold_out: 'Sold out',
  archived: 'Archived',
};

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');

  const profile = await getCurrentArtisanProfile();
  if (!profile) redirect('/dashboard/become-seller');

  const firstName = session.user.name.split(' ')[0] ?? session.user.name;

  // Stats — three independent aggregates in one round-trip per metric
  const [catalogStat] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogs)
    .where(eq(catalogs.artisanProfileId, profile.id));

  const [productStat] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${products.status} = 'published')::int`,
      inStockUnits: sql<number>`coalesce(sum(${products.stockOnHand}) filter (where ${products.status} = 'published'), 0)::int`,
    })
    .from(products)
    .where(eq(products.artisanProfileId, profile.id));

  // First (oldest) catalog — used as the default destination for "Add product"
  const [firstCatalog] = await db
    .select({ slug: catalogs.slug })
    .from(catalogs)
    .where(eq(catalogs.artisanProfileId, profile.id))
    .orderBy(asc(catalogs.createdAt))
    .limit(1);

  // Recent products with catalog slug for deep links
  const recent = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      status: products.status,
      stockOnHand: products.stockOnHand,
      catalogSlug: catalogs.slug,
    })
    .from(products)
    .innerJoin(catalogs, eq(catalogs.id, products.catalogId))
    .where(eq(products.artisanProfileId, profile.id))
    .orderBy(desc(products.createdAt))
    .limit(5);

  // Thumbnails for those rows
  const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
  if (recent.length > 0) {
    const imageRows = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          recent.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  const catalogCount = catalogStat?.count ?? 0;
  const productTotal = productStat?.total ?? 0;
  const productPublished = productStat?.published ?? 0;
  const inStockUnits = productStat?.inStockUnits ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl tracking-tight">Welcome back, {firstName}</h1>
        <p className="text-muted-foreground text-sm">Managing {profile.shopName}.</p>
      </header>

      {/* Stat cards */}
      <section aria-label="Shop overview" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Catalogs"
          value={catalogCount}
          hint={catalogCount === 1 ? 'collection' : 'collections'}
        />
        <StatCard label="Products" value={productTotal} hint={`${productPublished} published`} />
        <StatCard
          label="In stock"
          value={inStockUnits}
          hint={inStockUnits === 1 ? 'piece' : 'pieces'}
        />
      </section>

      {/* Recent products */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl tracking-tight">Recent products</h2>
          <Link
            href="/dashboard/catalogs"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            All catalogs →
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Create your first piece and it will show up here."
            action={
              firstCatalog ? (
                <Link
                  href={`/dashboard/catalogs/${firstCatalog.slug}/products/new`}
                  className={buttonVariants({ size: 'sm' })}
                >
                  Add a product
                </Link>
              ) : (
                <Link href="/dashboard/catalogs" className={buttonVariants({ size: 'sm' })}>
                  Create a catalog first
                </Link>
              )
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {recent.map((p) => {
              const img = primaryByProductId.get(p.id);
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/catalogs/${p.catalogSlug}/products/${p.slug}`}
                    className="hover:bg-secondary/50 flex items-center gap-4 p-3 transition-colors"
                  >
                    <div className="bg-secondary relative h-14 w-14 shrink-0 overflow-hidden rounded">
                      {img ? (
                        <Image
                          src={img.url}
                          alt={img.altText ?? p.title}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.title}</p>
                      <p className="text-muted-foreground text-xs">
                        Stock {p.stockOnHand} · /{p.catalogSlug}/{p.slug}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <PriceTag price={p.price} currency={p.currency} size="sm" />
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Action buttons */}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        {firstCatalog && (
          <Link
            href={`/dashboard/catalogs/${firstCatalog.slug}/products/new`}
            className={buttonVariants({ size: 'lg', className: 'h-11' })}
          >
            Add product
          </Link>
        )}
        <Link
          href="/dashboard/catalogs"
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-11' })}
        >
          Manage catalogs
        </Link>
        <Link
          href={`/shop/${profile.shopSlug}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'ghost', size: 'lg', className: 'h-11' })}
        >
          View public shop →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-normal tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-serif text-3xl">{value.toLocaleString()}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}
