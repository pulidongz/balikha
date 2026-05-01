import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { formatPrice } from '@/lib/format';

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
  // Public visibility: published or sold_out (so deep-linked items still resolve)
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
    title: row.product.title,
    description,
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
    .where(inArray(productImages.productId, [product.id]))
    .orderBy(asc(productImages.position));

  const inStock = product.status === 'published' && product.stockOnHand > 0;
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
        : product.status === 'sold_out'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: artisan.shopName },
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-muted-foreground mb-6 text-sm">
        <Link href={`/shop/${artisan.shopSlug}`} className="hover:underline">
          ← {artisan.shopName}
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-3">
          {images.length === 0 ? (
            <div className="bg-muted text-muted-foreground flex aspect-square items-center justify-center rounded-lg text-sm">
              No image
            </div>
          ) : (
            <>
              <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
                <Image
                  src={images[0]!.url}
                  alt={images[0]!.altText ?? product.title}
                  fill
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.slice(1).map((img) => (
                    <div
                      key={img.id}
                      className="bg-muted relative aspect-square overflow-hidden rounded"
                    >
                      <Image
                        src={img.url}
                        alt={img.altText ?? product.title}
                        fill
                        sizes="100px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
            <p className="text-muted-foreground text-sm">
              by{' '}
              <Link href={`/shop/${artisan.shopSlug}`} className="hover:underline">
                {artisan.shopName}
              </Link>
            </p>
          </header>

          <p className="text-2xl font-medium">{formatPrice(product.price, product.currency)}</p>

          <p className="text-sm">
            {product.status === 'sold_out' ? (
              <span className="text-destructive">Sold out</span>
            ) : product.stockOnHand > 0 ? (
              <span className="text-muted-foreground">{product.stockOnHand} in stock</span>
            ) : (
              <span className="text-destructive">Out of stock</span>
            )}
          </p>

          {product.description && (
            <div className="prose prose-sm max-w-none">
              <p className="leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {product.materials && product.materials.length > 0 && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Materials</dt>
                <dd>{product.materials.join(', ')}</dd>
              </div>
            )}
            {product.dimensions && (
              <div>
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd>
                  {[product.dimensions.width, product.dimensions.height, product.dimensions.depth]
                    .filter((v): v is number => typeof v === 'number')
                    .join(' × ')}{' '}
                  {product.dimensions.unit ?? 'cm'}
                </dd>
              </div>
            )}
            {product.weightGrams !== null && (
              <div>
                <dt className="text-muted-foreground">Weight</dt>
                <dd>{product.weightGrams} g</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </main>
  );
}
