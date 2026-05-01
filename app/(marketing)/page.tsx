import Link from 'next/link';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { buttonVariants } from '@/components/ui/button';
import { ArtisanCard } from '@/components/marketplace/artisan-card';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';

export const revalidate = 300;

const RECENT_LIMIT = 12;
const FEATURED_ARTISANS = 4;

export default async function HomePage() {
  // Recent published products with their artisan
  const productRows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.createdAt))
    .limit(RECENT_LIMIT);

  // Primary image per product
  const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
  if (productRows.length > 0) {
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
          productRows.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  // Featured artisans = those with at least one published product, plus a count
  const featuredArtisans = await db
    .select({
      id: artisanProfiles.id,
      shopSlug: artisanProfiles.shopSlug,
      shopName: artisanProfiles.shopName,
      location: artisanProfiles.location,
      bannerImageUrl: artisanProfiles.bannerImageUrl,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(artisanProfiles)
    .innerJoin(products, eq(products.artisanProfileId, artisanProfiles.id))
    .where(eq(products.status, 'published'))
    .groupBy(artisanProfiles.id)
    .orderBy(desc(sql`count(${products.id})`))
    .limit(FEATURED_ARTISANS);

  return (
    <div>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-12 lg:py-28">
          <div className="space-y-6 lg:col-span-7">
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
              Quietly made.
              <br />
              <span className="text-accent">Made to last.</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-base leading-relaxed md:text-lg">
              Balikha is a small marketplace for handmade work from independent Filipino artisans —
              pottery, textiles, prints, and the long-form craft behind each piece.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="#recent" className={buttonVariants({ size: 'lg' })}>
                Browse the catalog
              </Link>
              <Link href="#artisans" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Meet the makers
              </Link>
            </div>
          </div>
          <div className="hidden lg:col-span-5 lg:block">
            <div className="bg-secondary aspect-[4/5] overflow-hidden rounded-lg" aria-hidden>
              <div className="text-muted-foreground flex h-full items-center justify-center font-serif text-7xl">
                B
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured artisans */}
      <section id="artisans" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-3xl tracking-tight">Featured artisans</h2>
          <p className="text-muted-foreground text-sm">
            {featuredArtisans.length === 0
              ? 'No shops yet.'
              : `${featuredArtisans.length} ${featuredArtisans.length === 1 ? 'shop' : 'shops'}`}
          </p>
        </div>
        {featuredArtisans.length === 0 ? (
          <p className="text-muted-foreground">
            Be the first.{' '}
            <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
              Open a shop on Balikha
            </Link>
            .
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
            {featuredArtisans.map((a) => (
              <li key={a.id}>
                <ArtisanCard artisan={a} productCount={a.productCount} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent listings */}
      <section id="recent" className="bg-secondary/40 border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-3xl tracking-tight">Recent listings</h2>
            <p className="text-muted-foreground text-sm">
              {productRows.length} {productRows.length === 1 ? 'piece' : 'pieces'}
            </p>
          </div>
          {productRows.length === 0 ? (
            <p className="text-muted-foreground">No products listed yet.</p>
          ) : (
            <ProductGrid cols={4}>
              {productRows.map((p) => (
                <li key={p.id}>
                  <ProductCard
                    product={{
                      slug: p.slug,
                      title: p.title,
                      price: p.price,
                      currency: p.currency,
                    }}
                    artisan={{
                      shopSlug: p.artisanShopSlug,
                      shopName: p.artisanShopName,
                    }}
                    primaryImage={primaryByProductId.get(p.id)}
                  />
                </li>
              ))}
            </ProductGrid>
          )}
        </div>
      </section>
    </div>
  );
}
