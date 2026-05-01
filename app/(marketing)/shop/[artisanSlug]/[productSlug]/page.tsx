import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PriceTag } from '@/components/marketplace/price-tag';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';

export const revalidate = 300;

type Params = Promise<{ artisanSlug: string; productSlug: string }>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function loadProductWithArtisan(artisanSlug: string, productSlug: string) {
  const [row] = await db
    .select({
      product: products,
      artisan: artisanProfiles,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(and(eq(artisanProfiles.shopSlug, artisanSlug), eq(products.slug, productSlug)))
    .limit(1);
  if (!row) return null;
  if (row.product.status !== 'published' && row.product.status !== 'sold_out') {
    return null;
  }
  return row;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { artisanSlug, productSlug } = await params;
  const row = await loadProductWithArtisan(artisanSlug, productSlug);
  if (!row) return { title: 'Product not found' };

  const [primary] = await db
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, row.product.id))
    .orderBy(asc(productImages.position))
    .limit(1);

  const description = row.product.description ?? `${row.product.title} by ${row.artisan.shopName}.`;
  return {
    title: `${row.product.title} — ${row.artisan.shopName}`,
    description: description.slice(0, 155),
    openGraph: {
      type: 'website',
      title: row.product.title,
      description,
      url: `/shop/${row.artisan.shopSlug}/${row.product.slug}`,
      images: primary ? [{ url: primary.url }] : undefined,
    },
  };
}

export default async function ProductPublicPage({ params }: { params: Params }) {
  const { artisanSlug, productSlug } = await params;
  const row = await loadProductWithArtisan(artisanSlug, productSlug);
  if (!row) notFound();
  const { product, artisan } = row;

  const images = await db
    .select({
      id: productImages.id,
      url: productImages.url,
      width: productImages.width,
      height: productImages.height,
      altText: productImages.altText,
    })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position));

  // "More from this artisan" — published, excluding the current piece
  const moreFromArtisan = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
    })
    .from(products)
    .where(
      and(
        eq(products.artisanProfileId, artisan.id),
        eq(products.status, 'published'),
        ne(products.id, product.id),
      ),
    )
    .orderBy(desc(products.createdAt))
    .limit(4);

  const morePrimaryById = new Map<string, { url: string; altText: string | null }>();
  if (moreFromArtisan.length > 0) {
    const moreImages = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          moreFromArtisan.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of moreImages) {
      if (!morePrimaryById.has(img.productId)) morePrimaryById.set(img.productId, img);
    }
  }

  const inStock = product.status === 'published' && product.stockOnHand > 0;
  const isSoldOut = product.status === 'sold_out';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    image: images.map((img) => `${APP_URL}${img.url}`),
    sku: product.id,
    brand: { '@type': 'Brand', name: artisan.shopName },
    offers: {
      '@type': 'Offer',
      url: `${APP_URL}/shop/${artisan.shopSlug}/${product.slug}`,
      priceCurrency: product.currency,
      price: product.price,
      availability: inStock
        ? 'https://schema.org/InStock'
        : isSoldOut
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: artisan.shopName },
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-8 text-sm">
        <Link href="/" className="hover:text-foreground">
          Shop
        </Link>
        <span className="mx-2 opacity-50">›</span>
        <Link href={`/shop/${artisan.shopSlug}`} className="hover:text-foreground">
          {artisan.shopName}
        </Link>
        <span className="mx-2 opacity-50">›</span>
        <span className="text-foreground">{product.title}</span>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 3:2 split at lg+, stacked below */}
      <div className="grid gap-10 lg:grid-cols-5">
        {/* Gallery — wider side (3 of 5) */}
        <section className="space-y-3 lg:col-span-3">
          {images.length === 0 ? (
            <div className="bg-secondary text-muted-foreground flex aspect-square items-center justify-center rounded-lg text-sm">
              No image
            </div>
          ) : (
            <>
              <div className="bg-secondary relative aspect-square overflow-hidden rounded-lg">
                <Image
                  src={images[0]!.url}
                  alt={images[0]!.altText ?? product.title}
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.slice(1, 5).map((img) => (
                    <div
                      key={img.id}
                      className="bg-secondary relative aspect-square overflow-hidden rounded"
                    >
                      <Image
                        src={img.url}
                        alt={img.altText ?? product.title}
                        fill
                        sizes="120px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Info — narrower side (2 of 5) */}
        <section className="space-y-6 lg:col-span-2">
          <header className="space-y-2">
            <h1 className="font-serif text-3xl leading-tight tracking-tight md:text-4xl">
              {product.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              by{' '}
              <Link
                href={`/shop/${artisan.shopSlug}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {artisan.shopName}
              </Link>
            </p>
          </header>

          <div className="flex items-center gap-3">
            <PriceTag price={product.price} currency={product.currency} size="lg" />
            {isSoldOut && (
              <Badge variant="secondary" className="tracking-wide uppercase">
                Sold out
              </Badge>
            )}
            {inStock && product.stockOnHand <= 3 && (
              <Badge className="text-foreground border-transparent bg-[var(--gold)] tracking-wide uppercase">
                Only {product.stockOnHand} left
              </Badge>
            )}
          </div>

          <button
            type="button"
            disabled
            className={buttonVariants({ size: 'lg', className: 'w-full md:w-auto' })}
            aria-disabled="true"
            title="Cart and checkout arrive in a later phase"
          >
            {isSoldOut ? 'Sold out' : 'Add to cart'}
          </button>

          {product.description && (
            <p className="text-foreground text-base leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          )}

          <dl className="space-y-3 border-t pt-6 text-sm">
            {product.materials && product.materials.length > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Materials</dt>
                <dd className="text-right">{product.materials.join(', ')}</dd>
              </div>
            )}
            {product.dimensions && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd className="text-right">
                  {[product.dimensions.width, product.dimensions.height, product.dimensions.depth]
                    .filter((v): v is number => typeof v === 'number')
                    .join(' × ')}{' '}
                  {product.dimensions.unit ?? 'cm'}
                </dd>
              </div>
            )}
            {product.weightGrams !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Weight</dt>
                <dd className="text-right">{product.weightGrams} g</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* More from this artisan */}
      {moreFromArtisan.length > 0 && (
        <section className="mt-16 border-t pt-12 md:mt-20 md:pt-16">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl tracking-tight">More from {artisan.shopName}</h2>
            <Link
              href={`/shop/${artisan.shopSlug}`}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              View shop →
            </Link>
          </div>
          <ProductGrid cols={4}>
            {moreFromArtisan.map((p) => (
              <li key={p.id}>
                <ProductCard
                  product={p}
                  artisan={{ shopSlug: artisan.shopSlug, shopName: artisan.shopName }}
                  primaryImage={morePrimaryById.get(p.id)}
                  showArtisan={false}
                />
              </li>
            ))}
          </ProductGrid>
        </section>
      )}
    </div>
  );
}
