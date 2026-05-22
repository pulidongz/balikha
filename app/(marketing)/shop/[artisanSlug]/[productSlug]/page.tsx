import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products, userAddresses } from '@/db/schema';
import { env } from '@/env';
import { Badge } from '@/components/ui/badge';
import { OrderButton } from '@/components/marketplace/order-button';
import { AskTheMakerButton } from '@/components/marketplace/ask-the-maker-button';
import { PriceTag } from '@/components/marketplace/price-tag';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { WishlistToggle } from '@/components/marketplace/wishlist-toggle';
import { getCurrentUser } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { bucketLabel, getSellerReputationCached } from '@/lib/queries/seller-reputation';
import { recordRecentlyViewedAction } from '@/lib/actions/recently-viewed';

// Previously cached for 5 min — now per-user because of wishlist hearts.
// Calling getCurrentUser() makes this dynamic via headers().

type Params = Promise<{ artisanSlug: string; productSlug: string }>;

const APP_URL = env.NEXT_PUBLIC_APP_URL;

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

  const viewer = await getCurrentUser();
  const wishlistedIds = await getWishlistProductIds(viewer?.id ?? null);

  // Track this view. Fire-and-forget — the helper swallows its own
  // errors so a tracking failure can't break the product page render.
  // No-op for anonymous viewers (helper checks current user).
  await recordRecentlyViewedAction({ productId: product.id });

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
  const isOwnProduct = viewer !== null && viewer.id === artisan.userId;

  // Addresses for the order dialog. Only loaded for signed-in viewers
  // who could plausibly use them (in_stock, not their own product).
  // Default-shipping flag sorts the user's preferred address first.
  const orderAddresses =
    viewer && inStock && !isOwnProduct
      ? await db
          .select({
            id: userAddresses.id,
            label: userAddresses.label,
            recipientName: userAddresses.recipientName,
            line1: userAddresses.line1,
            city: userAddresses.city,
            province: userAddresses.province,
            isDefaultShipping: userAddresses.isDefaultShipping,
          })
          .from(userAddresses)
          .where(eq(userAddresses.userId, viewer.id))
          .orderBy(desc(userAddresses.isDefaultShipping), desc(userAddresses.createdAt))
      : [];
  const defaultAddressId =
    orderAddresses.find((a) => a.isDefaultShipping)?.id ?? orderAddresses[0]?.id ?? null;

  // Seller track record, surfaced in the order dialog as a trust signal
  // (Balikha has no escrow). Strings are formatted here so OrderButton,
  // a client component, never imports the server-only reputation module.
  const reputation = await getSellerReputationCached(artisan.id);
  const sellerTrust = {
    hasHistory: reputation.totalOrdersInWindow > 0,
    responseLine: reputation.responseTimeBucket
      ? reputation.responseRate < 1
        ? `Responds to ${Math.round(reputation.responseRate * 100)}% of orders, usually within ${bucketLabel(reputation.responseTimeBucket)}`
        : `Usually responds within ${bucketLabel(reputation.responseTimeBucket)}`
      : null,
    fulfillmentLine:
      reputation.fulfillmentRate !== null
        ? `${Math.round(reputation.fulfillmentRate * 100)}% of accepted orders fulfilled`
        : null,
  };

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
          </div>

          <div className="flex items-center gap-3">
            <OrderButton
              productId={product.id}
              productTitle={product.title}
              formattedPrice={formatPrice(product.price, product.currency)}
              shopName={artisan.shopName}
              state={
                isSoldOut
                  ? 'sold_out'
                  : !inStock
                    ? 'sold_out'
                    : viewer === null
                      ? 'signed_out'
                      : isOwnProduct
                        ? 'own_product'
                        : 'in_stock'
              }
              addresses={orderAddresses.map((a) => ({
                id: a.id,
                label: a.label,
                recipientName: a.recipientName,
                line1: a.line1,
                city: a.city,
                province: a.province,
              }))}
              defaultAddressId={defaultAddressId}
              sellerTrust={sellerTrust}
              signInRedirect={`/shop/${artisan.shopSlug}/${product.slug}`}
            />
            <WishlistToggle
              productId={product.id}
              initiallyInWishlist={wishlistedIds.has(product.id)}
              isSignedIn={viewer !== null}
              variant="inline"
              className="h-11 w-11"
            />
          </div>

          {!isOwnProduct && (
            <div>
              <AskTheMakerButton
                productId={product.id}
                signedIn={viewer !== null}
                productUrl={`/shop/${artisan.shopSlug}/${product.slug}`}
              />
            </div>
          )}

          {product.description && (
            <p className="text-foreground text-base leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          )}

          <dl className="space-y-3 border-t pt-6 text-sm">
            {inStock && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Availability</dt>
                <dd className="text-right">{product.stockOnHand} available</dd>
              </div>
            )}
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
                  inWishlist={wishlistedIds.has(p.id)}
                  isSignedIn={viewer !== null}
                />
              </li>
            ))}
          </ProductGrid>
        </section>
      )}
    </div>
  );
}
