import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows, artisanProfiles, catalogs, productImages, products } from '@/db/schema';
import { env } from '@/env';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CatalogSection } from '@/components/marketplace/catalog-section';
import { FollowToggle } from '@/components/marketplace/follow-toggle';
import { PriceTag } from '@/components/marketplace/price-tag';
import { SellerReputationSummary } from '@/components/marketplace/seller-reputation-summary';
import { ShareButton } from '@/components/marketplace/share-button';
import { JsonLd } from '@/components/seo/json-ld';
import { CoverEditDialog } from '@/components/studio/cover-edit-dialog';
import { EditStudioDialog } from '@/components/studio/edit-studio-dialog';
import { FeatureWorkButton } from '@/components/studio/feature-work-button';
import { PhotoEditDialog } from '@/components/studio/photo-edit-dialog';
import { UpdatesSection } from '@/components/studio/updates-section';
import { getCurrentUser } from '@/lib/auth-helpers';
import { initialsOf } from '@/lib/initials';
import { getSellerReputationCached } from '@/lib/queries/seller-reputation';
import { getAppreciationCounts } from '@/lib/queries/appreciations';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { logAnalyticsEvent } from '@/lib/analytics/log';
import { studioPath, workPath } from '@/lib/routes';
import { organizationJsonLd } from '@/lib/seo/structured-data';
import { isThinCount } from '@/lib/thin-count';

const APP_URL = env.NEXT_PUBLIC_APP_URL;

// Previously cached for 5 min — wishlist hearts are per-user so this
// becomes dynamic when getCurrentUser() reads request headers.

type Params = Promise<{ artisanSlug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function loadArtisan(artisanSlug: string) {
  const [profile] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.shopSlug, artisanSlug))
    .limit(1);
  return profile ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) return { title: 'Studio not found' };
  // Truncated for OG/meta description tags — bios can run long.
  const description = (profile.bio ?? `Handmade work by ${profile.shopName} on Balikha.`).slice(
    0,
    155,
  );
  return {
    title: profile.shopName,
    description,
    openGraph: {
      title: profile.shopName,
      description,
      url: studioPath(profile.shopSlug),
      // No images here: the composed share card comes from the sibling
      // opengraph-image.tsx (T18) — explicit images would override it.
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ArtisanStorefrontPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) notFound();

  // One-shot param set by FollowToggle's sign-in redirect; the toggle
  // applies it client-side and strips it from the URL.
  const { follow } = await searchParams;
  const pendingFollowId = typeof follow === 'string' ? follow : null;

  // Published catalogs for this artisan
  const publishedCatalogs = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.status, 'published')))
    .orderBy(desc(catalogs.createdAt));

  const catalogIds = publishedCatalogs.map((c) => c.id);

  // All published products in those catalogs
  const productList =
    catalogIds.length === 0
      ? []
      : await db
          .select()
          .from(products)
          .where(and(eq(products.status, 'published'), inArray(products.catalogId, catalogIds)))
          .orderBy(desc(products.createdAt));

  // Primary image per product
  const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
  if (productList.length > 0) {
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
          productList.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  // Group products by catalog
  const productsByCatalog = new Map<
    string,
    Array<
      (typeof productList)[number] & {
        primaryImage?: { url: string; altText: string | null } | null;
      }
    >
  >();
  for (const p of productList) {
    const list = productsByCatalog.get(p.catalogId) ?? [];
    list.push({ ...p, primaryImage: primaryByProductId.get(p.id) ?? null });
    productsByCatalog.set(p.catalogId, list);
  }

  // No breadcrumb JSON-LD here: with the marketplace "Shop" root dropped
  // (T1), the studio page is the top of its own trail, and single-item
  // breadcrumb lists carry no SEO signal.
  const org = organizationJsonLd({
    name: profile.shopName,
    url: `${APP_URL}${studioPath(profile.shopSlug)}`,
    description: profile.bio,
    image: profile.bannerImageUrl,
  });

  const viewer = await getCurrentUser();
  const isOwner = viewer !== null && viewer.id === profile.userId;

  // T11 view tracking. after() so the page render never waits on it;
  // logAnalyticsEvent owns its try/catch. Owner visits don't count —
  // checking your own page is not traction.
  if (!isOwner) {
    after(() =>
      logAnalyticsEvent({
        type: 'studio_viewed',
        userId: viewer?.id ?? null,
        artisanProfileId: profile.id,
        entityType: 'artisan',
        entityId: profile.id,
      }),
    );
  }

  const wishlistedIds = await getWishlistProductIds(viewer?.id ?? null);
  const reputation = await getSellerReputationCached(profile.id);
  const appreciationCounts = await getAppreciationCounts(productList.map((p) => p.id));

  const [followerRow] = await db
    .select({ value: count() })
    .from(artisanFollows)
    .where(eq(artisanFollows.artisanProfileId, profile.id));
  const followerCount = followerRow?.value ?? 0;

  // Pinned featured work (T2). Published-only — the FK alone can't keep a
  // since-archived work out of the visitor-facing slot.
  const featured = profile.featuredProductId
    ? ((
        await db
          .select({
            id: products.id,
            slug: products.slug,
            title: products.title,
            description: products.description,
            price: products.price,
            currency: products.currency,
          })
          .from(products)
          .where(and(eq(products.id, profile.featuredProductId), eq(products.status, 'published')))
          .limit(1)
      )[0] ?? null)
    : null;
  // Usually already in the catalog-grid image map; fetched directly when
  // not (e.g. a published work whose catalog is still draft).
  let featuredImage = featured ? (primaryByProductId.get(featured.id) ?? null) : null;
  if (featured && !featuredImage) {
    const [img] = await db
      .select({ url: productImages.url, altText: productImages.altText })
      .from(productImages)
      .where(eq(productImages.productId, featured.id))
      .orderBy(asc(productImages.position))
      .limit(1);
    featuredImage = img ?? null;
  }

  const externalLinks: Array<{ label: string; url: string }> = [
    { label: 'Instagram', url: profile.externalLinks?.instagram },
    { label: 'Facebook', url: profile.externalLinks?.facebook },
    { label: 'TikTok', url: profile.externalLinks?.tiktok },
    { label: 'Website', url: profile.externalLinks?.website },
  ].filter((l): l is { label: string; url: string } => Boolean(l.url));

  const joinedLabel = new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    year: 'numeric',
  }).format(profile.createdAt);

  // Static map so Tailwind sees the literal class names.
  const COVER_FOCUS_CLASS = {
    top: 'object-top',
    center: 'object-center',
    bottom: 'object-bottom',
  } as const;

  // Cheap PK lookup — only run for signed-in viewers.
  let initiallyFollowing = false;
  if (viewer) {
    const [row] = await db
      .select({ userId: artisanFollows.userId })
      .from(artisanFollows)
      .where(
        and(eq(artisanFollows.userId, viewer.id), eq(artisanFollows.artisanProfileId, profile.id)),
      )
      .limit(1);
    initiallyFollowing = Boolean(row);
  }

  return (
    <div>
      <JsonLd data={org} />
      {/* Cover — gracefully degrades if no cover image. The owner's edit
          control overlays the corner so editing happens where looking does. */}
      <section
        aria-label="Studio cover"
        className="bg-secondary relative aspect-[16/6] w-full overflow-hidden md:aspect-[16/4]"
      >
        {profile.bannerImageUrl ? (
          <Image
            src={profile.bannerImageUrl}
            alt={`${profile.shopName} cover`}
            fill
            sizes="100vw"
            className={`object-cover ${COVER_FOCUS_CLASS[profile.coverFocus]}`}
            priority
          />
        ) : (
          <div className="from-secondary to-muted absolute inset-0 bg-gradient-to-br" />
        )}
        {isOwner && (
          <div className="absolute top-3 right-3">
            <CoverEditDialog
              hasCover={profile.bannerImageUrl !== null}
              coverFocus={profile.coverFocus}
            />
          </div>
        )}
      </section>

      {/* Artisan identity row: avatar, shop name, reputation, follow.
          It sits below the banner. The storefront is card-free, so there
          is no opaque panel to carry an overlap, and bare text over the
          banner image would be unreadable. */}
      <section className="mx-auto mt-6 max-w-5xl px-4 sm:px-6 md:mt-8">
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-end md:gap-6 md:text-left">
          <div className="flex flex-col items-center gap-2">
            <Avatar className="border-background ring-border h-24 w-24 border-4 ring-1">
              <AvatarImage src={profile.profilePhotoUrl ?? undefined} alt={profile.shopName} />
              <AvatarFallback className="font-serif text-2xl">
                {initialsOf(profile.shopName)}
              </AvatarFallback>
            </Avatar>
            {isOwner && <PhotoEditDialog hasPhoto={profile.profilePhotoUrl !== null} />}
          </div>
          <div className="space-y-1 md:flex-1">
            <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{profile.shopName}</h1>
            <p className="text-muted-foreground text-sm">
              {profile.location && <>{profile.location} · </>}Joined {joinedLabel}
            </p>
            {profile.craftTags && profile.craftTags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 pt-1 md:justify-start">
                {profile.craftTags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {/* Thin-count rule (T12): a "2 followers" badge advertises
                emptiness, so the count only appears once it's meaningful. */}
            {!isThinCount(followerCount) && (
              <p className="text-muted-foreground text-sm">{followerCount} followers</p>
            )}
            <SellerReputationSummary
              reputation={reputation}
              className="mt-1 justify-center md:justify-start"
            />
          </div>
          <div className="flex items-center gap-2">
            {isOwner ? (
              <EditStudioDialog
                defaults={{
                  shopName: profile.shopName,
                  location: profile.location,
                  bio: profile.bio,
                  craftTags: profile.craftTags,
                  externalLinks: profile.externalLinks,
                }}
              />
            ) : (
              <FollowToggle
                artisanProfileId={profile.id}
                initiallyFollowing={initiallyFollowing}
                isSignedIn={viewer !== null}
                pendingFollowId={pendingFollowId}
              />
            )}
            <ShareButton
              title={`${profile.shopName} on Balikha`}
              text={profile.bio?.slice(0, 120)}
              path={studioPath(profile.shopSlug)}
            />
          </div>
        </div>

        {externalLinks.length > 0 && (
          <p className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm md:justify-start">
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="me noreferrer noopener"
                className="text-accent underline-offset-4 hover:underline"
              >
                {link.label}
              </a>
            ))}
          </p>
        )}

        {/* Story — multi-paragraph; whitespace-pre-line keeps the artist's
            paragraph breaks without storing markup. */}
        {profile.bio && (
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed whitespace-pre-line md:mx-0 md:text-left">
            {profile.bio}
          </p>
        )}
      </section>

      {/* Featured work — owner-pinned, rendered larger than the grid. */}
      {featured && (
        <section aria-label="Featured work" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl tracking-tight">Featured</h2>
            {isOwner && <FeatureWorkButton productId={featured.id} isFeatured />}
          </div>
          <Link
            href={workPath(profile.shopSlug, featured.slug)}
            className="group grid items-center gap-6 focus-visible:outline-none md:grid-cols-2 md:gap-10"
          >
            <div className="bg-secondary relative aspect-[4/3] overflow-hidden rounded-lg">
              {featuredImage ? (
                <Image
                  src={featuredImage.url}
                  alt={featuredImage.altText ?? featured.title}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                  No image
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="group-hover:text-accent font-serif text-2xl leading-tight tracking-tight transition-colors md:text-3xl">
                {featured.title}
              </h3>
              {featured.description && (
                <p className="text-muted-foreground line-clamp-3 text-base leading-relaxed">
                  {featured.description}
                </p>
              )}
              {featured.price !== null && (
                <PriceTag price={featured.price} currency={featured.currency} size="md" />
              )}
              <p className="text-muted-foreground text-sm">View work →</p>
            </div>
          </Link>
        </section>
      )}

      {/* Catalogs */}
      <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-6 md:py-20">
        {publishedCatalogs.length === 0 ||
        publishedCatalogs.every((c) => (productsByCatalog.get(c.id) ?? []).length === 0) ? (
          <p className="text-muted-foreground">No products listed yet. Check back soon.</p>
        ) : (
          publishedCatalogs.map((catalog) => (
            <CatalogSection
              key={catalog.id}
              catalog={catalog}
              artisan={profile}
              products={productsByCatalog.get(catalog.id) ?? []}
              wishlistedIds={wishlistedIds}
              isSignedIn={viewer !== null}
              canFeature={isOwner}
              featuredProductId={profile.featuredProductId}
              appreciationCounts={appreciationCounts}
            />
          ))
        )}

        <UpdatesSection artisanProfileId={profile.id} isOwner={isOwner} />
      </div>
    </div>
  );
}
