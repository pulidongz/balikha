import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { ChevronDownIcon } from 'lucide-react';
import { db } from '@/db';
import { artisanProfiles, productImages, products, userAddresses } from '@/db/schema';
import { env } from '@/env';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppreciateButton } from '@/components/marketplace/appreciate-button';
import { CommentsSection } from '@/components/marketplace/comments-section';
import { FollowToggle } from '@/components/marketplace/follow-toggle';
import { OrderButton } from '@/components/marketplace/order-button';
import { AskTheMakerButton } from '@/components/marketplace/ask-the-maker-button';
import { PriceTag } from '@/components/marketplace/price-tag';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { ShareButton } from '@/components/marketplace/share-button';
import { WishlistToggle } from '@/components/marketplace/wishlist-toggle';
import { WorkGallery } from '@/components/marketplace/work-gallery';
import { getCurrentUser } from '@/lib/auth-helpers';
import { formatPrice } from '@/lib/format';
import { initialsOf } from '@/lib/initials';
import { getAppreciationCounts, hasAppreciated } from '@/lib/queries/appreciations';
import { isFollowingArtisan } from '@/lib/queries/follows';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { bucketLabel, getSellerReputationCached } from '@/lib/queries/seller-reputation';
import { logAnalyticsEvent } from '@/lib/analytics/log';
import { recordRecentlyViewedAction } from '@/lib/actions/recently-viewed';
import { studioPath, workPath } from '@/lib/routes';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/structured-data';
import { JsonLd } from '@/components/seo/json-ld';

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

  const description = row.product.description ?? `${row.product.title} by ${row.artisan.shopName}.`;
  return {
    title: `${row.product.title} — ${row.artisan.shopName}`,
    description: description.slice(0, 155),
    openGraph: {
      type: 'website',
      title: row.product.title,
      description,
      url: workPath(row.artisan.shopSlug, row.product.slug),
      // No images here: the composed share card comes from the sibling
      // opengraph-image.tsx (T18).
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ProductPublicPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { artisanSlug, productSlug } = await params;
  const row = await loadProductWithArtisan(artisanSlug, productSlug);
  if (!row) notFound();
  const { product, artisan } = row;

  // One-shot params set by the sign-in redirects of AppreciateButton and
  // FollowToggle; each button applies its own client-side and strips it
  // from the URL (T5 pattern).
  const { appreciate, follow } = await searchParams;
  const pendingAppreciateId = typeof appreciate === 'string' ? appreciate : null;
  const pendingFollowId = typeof follow === 'string' ? follow : null;

  const viewer = await getCurrentUser();
  const wishlistedIds = await getWishlistProductIds(viewer?.id ?? null);
  const appreciationCounts = await getAppreciationCounts([product.id]);
  const viewerAppreciated = await hasAppreciated(viewer?.id ?? null, product.id);
  const viewerFollowsArtisan = await isFollowingArtisan(viewer?.id ?? null, artisan.id);

  // Track this view. Fire-and-forget — the helper swallows its own
  // errors so a tracking failure can't break the product page render.
  // No-op for anonymous viewers (helper checks current user).
  await recordRecentlyViewedAction({ productId: product.id });

  // T11: anonymous views (recordRecentlyViewedAction only covers
  // signed-in viewers). after() keeps it off the render path; owner
  // self-views are excluded at stats-query time by user id.
  if (!viewer) {
    after(() =>
      logAnalyticsEvent({
        type: 'product_viewed',
        userId: null,
        entityType: 'product',
        entityId: product.id,
      }),
    );
  }

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

  // T3: commerce only exists for for_sale works. salePrice is non-null
  // exactly when the work is for sale — every commerce block below gates
  // on it, which also gives TypeScript the narrowing it needs.
  let salePrice: string | null = null;
  if (product.salesMode === 'for_sale') {
    if (product.price === null) {
      // The products_for_sale_has_price CHECK makes this unreachable; if it
      // fires the row is corrupt — fail loud rather than render a price-less
      // order flow.
      throw new Error(`for_sale product ${product.id} has no price`);
    }
    salePrice = product.price;
  }
  const isForSale = salePrice !== null;
  const inStock = isForSale && product.status === 'published' && product.stockOnHand > 0;
  const isSoldOut = isForSale && product.status === 'sold_out';
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

  const jsonLd = productJsonLd({
    name: product.title,
    description: product.description,
    images: images.map((img) => img.url),
    sku: product.id,
    brandName: artisan.shopName,
    url: `${APP_URL}${workPath(artisan.shopSlug, product.slug)}`,
    offer:
      salePrice !== null
        ? {
            currency: product.currency,
            price: salePrice,
            availability: inStock ? 'InStock' : isSoldOut ? 'SoldOut' : 'OutOfStock',
          }
        : undefined,
  });

  // T1: the trail starts at the studio, not a marketplace "Shop" root.
  const breadcrumb = breadcrumbJsonLd([
    { name: artisan.shopName, url: `${APP_URL}${studioPath(artisan.shopSlug)}` },
    { name: product.title, url: `${APP_URL}${workPath(artisan.shopSlug, product.slug)}` },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16">
      {/* Breadcrumb — studio-rooted: {Studio name} › {Work title} */}
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-8 text-sm">
        <Link href={studioPath(artisan.shopSlug)} className="hover:text-foreground">
          {artisan.shopName}
        </Link>
        <span className="mx-2 opacity-50">›</span>
        <span className="text-foreground">{product.title}</span>
      </nav>

      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumb} />

      {/* 3:2 split at lg+, stacked below */}
      <div className="grid gap-10 lg:grid-cols-5">
        {/* Gallery — wider side (3 of 5) */}
        <section aria-label="Photos" className="lg:col-span-3">
          <WorkGallery images={images} title={product.title} />
        </section>

        {/* Identity + actions rail — narrower side (2 of 5). Sticky so the
            actions stay reachable while a long gallery scrolls. */}
        <section className="space-y-6 lg:sticky lg:top-20 lg:col-span-2 lg:self-start">
          <header className="space-y-2">
            <h1 className="font-serif text-3xl leading-tight tracking-tight md:text-4xl">
              {product.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              by{' '}
              <Link
                href={studioPath(artisan.shopSlug)}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {artisan.shopName}
              </Link>
            </p>
          </header>

          {salePrice !== null && (
            <div className="flex items-center gap-3">
              <PriceTag price={salePrice} currency={product.currency} size="lg" />
              {isSoldOut && (
                <Badge variant="secondary" className="tracking-wide uppercase">
                  Sold out
                </Badge>
              )}
            </div>
          )}

          {product.salesMode === 'commission_inquiries' && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Open for commission inquiries — a piece like this can be made for you.
            </p>
          )}

          {salePrice !== null ? (
            <>
              <div className="flex items-center gap-3">
                <OrderButton
                  productId={product.id}
                  productTitle={product.title}
                  formattedPrice={formatPrice(salePrice, product.currency)}
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
                  signInRedirect={workPath(artisan.shopSlug, product.slug)}
                />
                {!isOwnProduct && (
                  <WishlistToggle
                    productId={product.id}
                    initiallyInWishlist={wishlistedIds.has(product.id)}
                    isSignedIn={viewer !== null}
                    variant="inline"
                    className="h-11 w-11"
                  />
                )}
              </div>

              {inStock && (
                <p className="text-muted-foreground text-sm">{product.stockOnHand} available</p>
              )}

              {!isOwnProduct && (
                <div>
                  <AskTheMakerButton
                    productId={product.id}
                    signedIn={viewer !== null}
                    productUrl={workPath(artisan.shopSlug, product.slug)}
                  />
                </div>
              )}
            </>
          ) : (
            /* Showcase / commission works: no commerce UI — "Ask the maker"
               is the primary action (T3). Wishlist still applies; saving a
               showcase piece is a perfectly good signal. Neither renders for
               the owner — you can't inquire about or save your own work. */
            <div className="flex items-center gap-3">
              {!isOwnProduct && (
                <AskTheMakerButton
                  productId={product.id}
                  signedIn={viewer !== null}
                  productUrl={workPath(artisan.shopSlug, product.slug)}
                  prominent
                />
              )}
              {!isOwnProduct && (
                <WishlistToggle
                  productId={product.id}
                  initiallyInWishlist={wishlistedIds.has(product.id)}
                  isSignedIn={viewer !== null}
                  variant="inline"
                  className="h-11 w-11"
                />
              )}
            </div>
          )}

          {/* Appreciation + share. The appreciate button never renders for
              the owner (own-work rule) — the server action guards too. */}
          <div className="flex items-center gap-2">
            {!isOwnProduct && (
              <AppreciateButton
                productId={product.id}
                initiallyAppreciated={viewerAppreciated}
                initialCount={appreciationCounts.get(product.id) ?? 0}
                isSignedIn={viewer !== null}
                pendingAppreciateId={pendingAppreciateId}
              />
            )}
            <ShareButton
              title={`${product.title} — ${artisan.shopName}`}
              text={product.description?.slice(0, 120)}
              path={workPath(artisan.shopSlug, product.slug)}
            />
          </div>
        </section>
      </div>

      {/* Editorial sections, capped at a readable measure. Ticket order:
          story → materials & technique → maker → quiet care/shipping.
          On mobile these follow the rail directly, so the reading order
          holds on every viewport. */}
      <div className="mt-12 max-w-2xl space-y-10 md:mt-16">
        {product.description && (
          <section aria-label="About this piece">
            <h2 className="font-serif text-2xl tracking-tight">About this piece</h2>
            <p className="mt-4 text-base leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </section>
        )}

        {((product.materials && product.materials.length > 0) || product.technique) && (
          <section aria-label="Materials and technique" className="border-t pt-8">
            <h2 className="font-serif text-2xl tracking-tight">Materials & technique</h2>
            <dl className="mt-4 space-y-3">
              {product.materials && product.materials.length > 0 && (
                <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm sm:pt-1">Materials</dt>
                  <dd className="text-base leading-relaxed">{product.materials.join(', ')}</dd>
                </div>
              )}
              {product.technique && (
                <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                  <dt className="text-muted-foreground text-sm sm:pt-1">Technique</dt>
                  <dd className="text-base leading-relaxed whitespace-pre-line">
                    {product.technique}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* The maker block — the hands stay visible. Follower identities
            are never shown here (T10) and no count renders (T12). */}
        <section aria-label="The maker" className="border-t pt-8">
          <div className="flex items-center gap-4">
            <Avatar className="ring-border size-16 ring-1">
              <AvatarImage src={artisan.profilePhotoUrl ?? undefined} alt={artisan.shopName} />
              <AvatarFallback className="font-serif text-xl">
                {initialsOf(artisan.shopName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                href={studioPath(artisan.shopSlug)}
                className="font-serif text-xl tracking-tight underline-offset-4 hover:underline"
              >
                {artisan.shopName}
              </Link>
              <p className="text-muted-foreground text-sm">
                {artisan.location && <>{artisan.location} · </>}
                <Link href={studioPath(artisan.shopSlug)} className="hover:text-foreground">
                  Visit the studio →
                </Link>
              </p>
            </div>
            {!isOwnProduct && (
              <FollowToggle
                artisanProfileId={artisan.id}
                initiallyFollowing={viewerFollowsArtisan}
                isSignedIn={viewer !== null}
                pendingFollowId={pendingFollowId}
              />
            )}
          </div>
        </section>

        {(product.careInstructions ||
          product.dimensions ||
          product.weightGrams !== null ||
          artisan.policies) && (
          <section aria-label="Care and details" className="border-t pt-8">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between font-serif text-xl tracking-tight [&::-webkit-details-marker]:hidden">
                Care & details
                <ChevronDownIcon
                  aria-hidden
                  className="text-muted-foreground size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <dl className="mt-4 space-y-3">
                {product.careInstructions && (
                  <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                    <dt className="text-muted-foreground text-sm">Care</dt>
                    <dd className="text-sm leading-relaxed whitespace-pre-line">
                      {product.careInstructions}
                    </dd>
                  </div>
                )}
                {product.dimensions && (
                  <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                    <dt className="text-muted-foreground text-sm">Dimensions</dt>
                    <dd className="text-sm leading-relaxed">
                      {[
                        product.dimensions.width,
                        product.dimensions.height,
                        product.dimensions.depth,
                      ]
                        .filter((v): v is number => typeof v === 'number')
                        .join(' × ')}{' '}
                      {product.dimensions.unit ?? 'cm'}
                    </dd>
                  </div>
                )}
                {product.weightGrams !== null && (
                  <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                    <dt className="text-muted-foreground text-sm">Weight</dt>
                    <dd className="text-sm leading-relaxed">{product.weightGrams} g</dd>
                  </div>
                )}
                {artisan.policies && (
                  <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                    <dt className="text-muted-foreground text-sm">Shipping & policies</dt>
                    <dd className="text-sm leading-relaxed whitespace-pre-line">
                      {artisan.policies}
                    </dd>
                  </div>
                )}
              </dl>
            </details>
          </section>
        )}

        <CommentsSection
          productId={product.id}
          workPathname={workPath(artisan.shopSlug, product.slug)}
          viewerUserId={viewer?.id ?? null}
          ownerUserId={artisan.userId}
        />
      </div>

      {/* More from this artisan */}
      {moreFromArtisan.length > 0 && (
        <section className="mt-16 border-t pt-12 md:mt-20 md:pt-16">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl tracking-tight">More from {artisan.shopName}</h2>
            <Link
              href={studioPath(artisan.shopSlug)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              View studio →
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
