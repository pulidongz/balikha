import Link from 'next/link';
import Image from 'next/image';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';
import { buttonVariants } from '@/components/ui/button';
import { ArtisanCard } from '@/components/marketplace/artisan-card';
import { EmptyState } from '@/components/marketplace/empty-state';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { RecentlyViewedStrip } from '@/components/marketplace/recently-viewed-strip';
import { UpdateCard } from '@/components/marketplace/update-card';
import { getAppreciationCounts } from '@/lib/queries/appreciations';
import { getRecentProducts, type RecentProductRow } from '@/lib/queries/products';
import { getFollowedFeed, getStudiosToFollow, followsAnyStudio } from '@/lib/queries/feed';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { getRecentlyViewed } from '@/lib/queries/recently-viewed';
import { bucketLabel, getSellerReputationsForArtisans } from '@/lib/queries/seller-reputation';
import { formatRelativeTime } from '@/lib/format';
import type { Page } from '@/lib/queries/paginate';

// Previously cached for 5 min, but personalized wishlist hearts make this
// per-user. Calling getCurrentUser() opts the page into dynamic rendering
// anyway via headers(); the explicit revalidate is dropped for clarity.

const FEATURED_ARTISANS = 4;
const STUDIOS_TO_FOLLOW = 4;

interface HomePageProps {
  searchParams: Promise<{ cursor?: string }>;
}

// T6: the signed-in homepage is the feed — the loop is follow → feed →
// return. Signed-out visitors keep the editorial landing.
export default async function HomePage({ searchParams }: HomePageProps) {
  const { cursor } = await searchParams;
  const viewer = await getCurrentUser();

  if (viewer) return <HomeFeed viewerId={viewer.id} cursor={cursor} />;
  return <EditorialLanding cursor={cursor} />;
}

/**
 * Recent-listings grid with seller response-time labels and the
 * cursor-paginated "Next →" link. Shared by the signed-out landing and the
 * signed-in fallback (following nothing / nothing new) so the reputation
 * lookup logic lives once.
 */
async function RecentListingsSection({
  recent,
  isSignedIn,
  wishlistedIds,
}: {
  recent: Page<RecentProductRow>;
  isSignedIn: boolean;
  wishlistedIds: Set<string>;
}) {
  // Seller reputation for the grid. getRecentProducts carries shop slug,
  // not profile id, so resolve slugs → ids in one query, then batch-fetch
  // reputations in one more — no N+1 per card.
  const recentShopSlugs = Array.from(new Set(recent.items.map((p) => p.artisanShopSlug)));
  const profileIdBySlug = new Map<string, string>();
  if (recentShopSlugs.length > 0) {
    const profileRows = await db
      .select({ id: artisanProfiles.id, shopSlug: artisanProfiles.shopSlug })
      .from(artisanProfiles)
      .where(inArray(artisanProfiles.shopSlug, recentShopSlugs));
    for (const r of profileRows) profileIdBySlug.set(r.shopSlug, r.id);
  }
  const reputationByProfileId = await getSellerReputationsForArtisans(
    Array.from(profileIdBySlug.values()),
  );
  const appreciationCounts = await getAppreciationCounts(recent.items.map((p) => p.id));

  if (recent.items.length === 0) {
    return <p className="text-muted-foreground">No products listed yet.</p>;
  }

  return (
    <>
      <ProductGrid cols={4}>
        {recent.items.map((p) => {
          const profileId = profileIdBySlug.get(p.artisanShopSlug);
          const bucket = profileId
            ? reputationByProfileId.get(profileId)?.responseTimeBucket
            : null;
          return (
            <li key={p.id}>
              <ProductCard
                product={{
                  id: p.id,
                  slug: p.slug,
                  title: p.title,
                  price: p.price,
                  currency: p.currency,
                }}
                artisan={{
                  shopSlug: p.artisanShopSlug,
                  shopName: p.artisanShopName,
                }}
                primaryImage={p.primaryImage ?? undefined}
                inWishlist={wishlistedIds.has(p.id)}
                isSignedIn={isSignedIn}
                responseTimeLabel={bucket ? bucketLabel(bucket) : undefined}
                appreciationCount={appreciationCounts.get(p.id)}
              />
            </li>
          );
        })}
      </ProductGrid>

      {recent.nextCursor && (
        <div className="mt-12 flex justify-center">
          <Link
            href={`/?cursor=${recent.nextCursor}#recent`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Next →
          </Link>
        </div>
      )}
    </>
  );
}

/** Signed-in homepage: reverse-chronological work from followed studios. */
async function HomeFeed({ viewerId, cursor }: { viewerId: string; cursor: string | undefined }) {
  const hasFollows = await followsAnyStudio(viewerId);
  const wishlistedIds = await getWishlistProductIds(viewerId);
  const recentlyViewed = await getRecentlyViewed(viewerId, 12);

  const feed = hasFollows ? await getFollowedFeed(viewerId, { cursor }) : null;
  const showFeed = feed !== null && feed.items.length > 0;
  const feedAppreciationCounts = showFeed
    ? await getAppreciationCounts(feed.items.filter((i) => i.kind === 'work').map((p) => p.id))
    : new Map<string, number>();
  // The platform-wide fallback renders whenever the personal feed has
  // nothing to show: no follows yet, or followed studios are quiet.
  const fallbackRecent = showFeed ? null : await getRecentProducts({ cursor });
  const studiosToFollow = hasFollows ? [] : await getStudiosToFollow(viewerId, STUDIOS_TO_FOLLOW);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <header className="mb-10">
        <h1 className="font-serif text-3xl tracking-tight md:text-4xl">
          New from studios you follow
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">The latest works, newest first.</p>
      </header>

      {showFeed && (
        <>
          <ProductGrid cols={3}>
            {feed.items.map((item) =>
              item.kind === 'work' ? (
                <li key={`work-${item.id}`}>
                  <ProductCard
                    product={{
                      id: item.id,
                      slug: item.slug,
                      title: item.title,
                      price: item.price,
                      currency: item.currency,
                    }}
                    artisan={{ shopSlug: item.artisanShopSlug, shopName: item.artisanShopName }}
                    primaryImage={item.primaryImage}
                    inWishlist={wishlistedIds.has(item.id)}
                    isSignedIn
                    artisanAvatarUrl={item.artisanPhotoUrl}
                    relativeTimeLabel={formatRelativeTime(item.createdAt)}
                    appreciationCount={feedAppreciationCounts.get(item.id)}
                  />
                </li>
              ) : (
                <li key={`update-${item.id}`}>
                  <UpdateCard
                    update={item}
                    relativeTimeLabel={formatRelativeTime(item.createdAt)}
                  />
                </li>
              ),
            )}
          </ProductGrid>

          {feed.nextCursor && (
            <div className="mt-12 flex justify-center">
              <Link
                href={`/?cursor=${feed.nextCursor}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Next →
              </Link>
            </div>
          )}
        </>
      )}

      {!showFeed && hasFollows && (
        <EmptyState
          title="Nothing new from your studios yet"
          description="The studios you follow haven't shared new work. Meanwhile, here's what's fresh across Balikha."
        />
      )}

      {!hasFollows && (
        <section aria-label="Studios to follow" className="mb-16">
          <div className="mb-6">
            <h2 className="font-serif text-2xl tracking-tight">Studios to follow</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Follow a studio and its new work lands here.
            </p>
          </div>
          {studiosToFollow.length === 0 ? (
            <p className="text-muted-foreground">No studios yet — you are early.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
              {studiosToFollow.map((a) => (
                <li key={a.id}>
                  <ArtisanCard artisan={a} productCount={a.productCount} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {fallbackRecent && (
        <section id="recent" aria-label="Recent works" className="mt-12">
          <h2 className="mb-6 font-serif text-2xl tracking-tight">Recent works across Balikha</h2>
          <RecentListingsSection recent={fallbackRecent} isSignedIn wishlistedIds={wishlistedIds} />
        </section>
      )}

      {/* Only renders with 4+ tracked views; returns null below the threshold. */}
      <section className="mt-16">
        <RecentlyViewedStrip items={recentlyViewed} minItems={4} />
      </section>
    </div>
  );
}

/** Signed-out homepage: the editorial landing, unchanged by T6. */
async function EditorialLanding({ cursor }: { cursor: string | undefined }) {
  // Cursor-paginated. Forward-only: nextCursor lets us build "Next →";
  // browser back covers "Previous". Stable under concurrent inserts —
  // a new product appearing between page loads doesn't shift rows around.
  const recent = await getRecentProducts({ cursor });

  // Featured artisans — those with at least one published product, plus a count.
  // Not paginated; this is a "homepage hero" slot. Ordered by most recently
  // opened shop, not inventory volume: a storefront frames work, it does not
  // rank makers against one another.
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
    .orderBy(desc(artisanProfiles.createdAt))
    .limit(FEATURED_ARTISANS);

  const onFirstPage = !cursor;

  // Hero collage — real maker work, not a placeholder. Take the first few
  // recent products that actually carry a primary image; if none do, the
  // hero copy runs full-width instead of showing an empty frame.
  const heroCollage = recent.items
    .filter((p): p is typeof p & { primaryImage: { url: string; altText: string | null } } =>
      Boolean(p.primaryImage),
    )
    .slice(0, 4);
  const hasHeroCollage = heroCollage.length > 0;

  return (
    <div>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-12 lg:py-28">
          <div className={`space-y-6 ${hasHeroCollage ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
              Quietly made.
              <br />
              <span className="text-accent">Made to last.</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-base leading-relaxed md:text-lg">
              Balikha is a small marketplace for handmade work from independent Filipino artisans:
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
            {/* T4: the artist entry point leads with showcasing; selling is
                mentioned as optional, not assumed. */}
            <p className="text-muted-foreground text-sm">
              Make things yourself?{' '}
              <Link
                href="/sign-up?intent=seller"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Share your work on Balikha
              </Link>{' '}
              — and sell it if you want to.
            </p>
          </div>
          {hasHeroCollage && (
            <div className="hidden lg:col-span-5 lg:block">
              <div className="grid grid-cols-2 gap-3">
                {heroCollage.map((p) => (
                  <div
                    key={p.id}
                    className="bg-secondary relative aspect-square overflow-hidden rounded-lg"
                  >
                    <Image
                      src={p.primaryImage.url}
                      alt={p.primaryImage.altText ?? p.title}
                      fill
                      sizes="(min-width: 1024px) 21vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Featured artisans */}
      <section id="artisans" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-3xl tracking-tight">Featured artisans</h2>
          <p className="text-muted-foreground text-sm">
            {featuredArtisans.length === 0
              ? 'No studios yet.'
              : `${featuredArtisans.length} ${featuredArtisans.length === 1 ? 'studio' : 'studios'}`}
          </p>
        </div>
        {featuredArtisans.length === 0 ? (
          <p className="text-muted-foreground">
            Be the first.{' '}
            <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
              Open a studio on Balikha
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
            <h2 className="font-serif text-3xl tracking-tight">
              {onFirstPage ? 'Recent listings' : 'More listings'}
            </h2>
            {!onFirstPage && (
              <Link href="/#recent" className="text-muted-foreground hover:text-foreground text-sm">
                ← Back to most recent
              </Link>
            )}
          </div>
          <RecentListingsSection recent={recent} isSignedIn={false} wishlistedIds={new Set()} />
        </div>
      </section>
    </div>
  );
}
