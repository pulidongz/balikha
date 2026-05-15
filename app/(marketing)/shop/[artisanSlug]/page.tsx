import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows, artisanProfiles, catalogs, productImages, products } from '@/db/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CatalogSection } from '@/components/marketplace/catalog-section';
import { FollowToggle } from '@/components/marketplace/follow-toggle';
import { SellerReputationSummary } from '@/components/marketplace/seller-reputation-summary';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getSellerReputationCached } from '@/lib/queries/seller-reputation';
import { getWishlistProductIds } from '@/lib/queries/wishlist';

// Previously cached for 5 min — wishlist hearts are per-user so this
// becomes dynamic when getCurrentUser() reads request headers.

type Params = Promise<{ artisanSlug: string }>;

async function loadArtisan(artisanSlug: string) {
  const [profile] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.shopSlug, artisanSlug))
    .limit(1);
  return profile ?? null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) return { title: 'Shop not found' };
  const description = profile.bio ?? `Handmade work by ${profile.shopName} on Balikha.`;
  return {
    title: profile.shopName,
    description,
    openGraph: {
      title: profile.shopName,
      description,
      url: `/shop/${profile.shopSlug}`,
      images: profile.bannerImageUrl ? [{ url: profile.bannerImageUrl }] : undefined,
    },
  };
}

export default async function ArtisanStorefrontPage({ params }: { params: Params }) {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) notFound();

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

  const viewer = await getCurrentUser();
  const wishlistedIds = await getWishlistProductIds(viewer?.id ?? null);
  const reputation = await getSellerReputationCached(profile.id);

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
      {/* Banner — gracefully degrades if no banner image */}
      <section
        aria-label="Shop banner"
        className="bg-secondary relative aspect-[16/6] w-full overflow-hidden md:aspect-[16/4]"
      >
        {profile.bannerImageUrl ? (
          <Image
            src={profile.bannerImageUrl}
            alt={`${profile.shopName} banner`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="from-secondary to-muted absolute inset-0 bg-gradient-to-br" />
        )}
      </section>

      {/* Artisan info row.
          The negative top-margin overlaps the banner so the avatar
          appears to float over its bottom edge. On md+ we keep the
          overlap modest (-mt-10 ≈ 40px) — large banners on wide
          displays were leaving the shop name visually crowded against
          the banner; the smaller overlap gives the name breathing room
          while still letting the avatar protrude. */}
      <section className="mx-auto -mt-12 max-w-5xl px-4 sm:px-6 md:-mt-10">
        <div className="bg-card flex flex-col items-center gap-4 rounded-lg border p-6 text-center md:flex-row md:items-end md:gap-6 md:text-left">
          <Avatar className="border-card ring-border h-24 w-24 border-4 ring-1">
            <AvatarImage src={profile.bannerImageUrl ?? undefined} alt={profile.shopName} />
            <AvatarFallback className="font-serif text-2xl">
              {initialsOf(profile.shopName)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 md:flex-1">
            <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{profile.shopName}</h1>
            {profile.location && (
              <p className="text-muted-foreground text-sm">{profile.location}</p>
            )}
            <SellerReputationSummary
              reputation={reputation}
              className="mt-1 justify-center md:justify-start"
            />
          </div>
          <FollowToggle
            artisanProfileId={profile.id}
            initiallyFollowing={initiallyFollowing}
            isSignedIn={viewer !== null}
          />
        </div>
        {profile.bio && (
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed md:text-left">
            {profile.bio}
          </p>
        )}
      </section>

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
            />
          ))
        )}
      </div>
    </div>
  );
}
