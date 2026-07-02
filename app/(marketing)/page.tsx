import Link from 'next/link';
import Image from 'next/image';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';
import { buttonVariants } from '@/components/ui/button';
import { ArtisanCard } from '@/components/marketplace/artisan-card';
import { EmptyState } from '@/components/marketplace/empty-state';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { RecentListingsSection } from '@/components/marketplace/recent-listings-section';
import { RecentlyViewedStrip } from '@/components/marketplace/recently-viewed-strip';
import { UpdateCard } from '@/components/marketplace/update-card';
import { getAppreciationCounts } from '@/lib/queries/appreciations';
import { getEditorialFeature } from '@/lib/queries/editorial-feature';
import { getRecentProducts } from '@/lib/queries/products';
import { getFollowedFeed, getStudiosToFollow, followsAnyStudio } from '@/lib/queries/feed';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { getRecentlyViewed } from '@/lib/queries/recently-viewed';
import { formatRelativeTime } from '@/lib/format';
import { studioPath } from '@/lib/routes';
import { isThinCount } from '@/lib/thin-count';
import { Reveal } from '@/components/motion/reveal';
import { StaggerGrid, StaggerGridItem } from '@/components/motion/stagger';

// Previously cached for 5 min, but personalized wishlist hearts make this
// per-user. Calling getCurrentUser() opts the page into dynamic rendering
// anyway via headers(); the explicit revalidate is dropped for clarity.

const FEATURED_ARTISANS = 4;
const STUDIOS_TO_FOLLOW = 4;
// Bounded discovery strip on the signed-in home — a teaser, not a catalog.
// Deep browsing lives on /browse (linked from the strip header).
const DISCOVER_LIMIT = 8;

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

/** Signed-in homepage: reverse-chronological work from followed studios. */
async function HomeFeed({ viewerId, cursor }: { viewerId: string; cursor: string | undefined }) {
  // First tier — these four are mutually independent, so fetch concurrently.
  // Discovery is ALWAYS available from home — a bounded strip of recent work
  // across Balikha, shown beneath the feed regardless of who you follow, so
  // following a studio never costs you access to the wider catalog. Bounded
  // (no cursor): it's a teaser; /browse carries full pagination. Its own
  // page-1 query means it never collides with the feed's ?cursor=.
  const [hasFollows, wishlistedIds, recentlyViewed, discover] = await Promise.all([
    followsAnyStudio(viewerId),
    getWishlistProductIds(viewerId),
    getRecentlyViewed(viewerId, 12),
    getRecentProducts({ limit: DISCOVER_LIMIT }),
  ]);

  // Second tier — both depend only on hasFollows, so run them together.
  const [feed, studiosToFollow] = await Promise.all([
    hasFollows ? getFollowedFeed(viewerId, { cursor }) : Promise.resolve(null),
    hasFollows ? Promise.resolve([]) : getStudiosToFollow(viewerId, STUDIOS_TO_FOLLOW),
  ]);
  const showFeed = feed !== null && feed.items.length > 0;
  const feedAppreciationCounts = showFeed
    ? await getAppreciationCounts(feed.items.filter((i) => i.kind === 'work').map((p) => p.id))
    : new Map<string, number>();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <header className="mb-10">
        <h1 className="text-headline font-serif">New from studios you follow</h1>
        <p className="text-muted-foreground mt-2 text-sm">The latest works, newest first.</p>
      </header>

      {showFeed && (
        <>
          <ProductGrid cols={3}>
            {feed.items.map((item) =>
              item.kind === 'work' ? (
                <ProductCard
                  key={`work-${item.id}`}
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
              ) : (
                <UpdateCard
                  key={`update-${item.id}`}
                  update={item}
                  relativeTimeLabel={formatRelativeTime(item.createdAt)}
                />
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
            <h2 className="text-headline font-serif">Studios to follow</h2>
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

      <section id="recent" aria-label="Recent works across Balikha" className="mt-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-headline font-serif">Recent works across Balikha</h2>
          <Link href="/browse" className="text-muted-foreground hover:text-foreground text-sm">
            Browse all →
          </Link>
        </div>
        {/* Bounded teaser: no nextHref, so no inline "Next →" — "Browse all"
            above carries through to the fully paginated /browse page. */}
        <RecentListingsSection recent={discover} isSignedIn wishlistedIds={wishlistedIds} />
      </section>

      {/* Only renders with 4+ tracked views; returns null below the threshold. */}
      <section className="mt-16">
        <RecentlyViewedStrip items={recentlyViewed} minItems={4} />
      </section>
    </div>
  );
}

/** Signed-out homepage: the editorial landing. */
async function EditorialLanding({ cursor }: { cursor: string | undefined }) {
  // Cursor-paginated. Forward-only: nextCursor lets us build "Next →";
  // browser back covers "Previous". Stable under concurrent inserts —
  // a new product appearing between page loads doesn't shift rows around.
  const recent = await getRecentProducts({ cursor });
  const feature = await getEditorialFeature();

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
        <div className="py-section-lg mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className={`space-y-6 ${hasHeroCollage ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
            <h1 className="text-display font-serif">
              Quietly made.
              <br />
              <span className="text-accent">Made to last.</span>
            </h1>
            <p className="text-muted-foreground text-lead max-w-xl">
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

      {/* Editorial feature (T15) — founder-curated, never paid. Magazine
          treatment, deliberately distinct from the auto-populated grids:
          this is the gallery's wall text, not a sponsored card. */}
      {feature && (
        <section aria-label="In focus" className="bg-secondary/30 border-b">
          <div className="py-section mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal variant="soft">
              <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase">In focus</p>
              {feature.artisan && (
                <div className="mt-6 grid gap-8 md:grid-cols-12 md:items-center">
                  {feature.artisan.bannerImageUrl && (
                    <div className="md:col-span-5">
                      <div className="bg-secondary relative aspect-[4/3] overflow-hidden rounded-lg">
                        <Image
                          src={feature.artisan.bannerImageUrl}
                          alt={feature.artisan.shopName}
                          fill
                          sizes="(min-width: 768px) 40vw, 100vw"
                          className="object-cover"
                        />
                      </div>
                    </div>
                  )}
                  {/* No banner → take the full row. A spanless child of the
                      12-col grid would sit in a single ~90px track and wrap
                      one word per line. */}
                  <div
                    className={
                      feature.artisan.bannerImageUrl
                        ? 'space-y-4 md:col-span-7'
                        : 'space-y-4 md:col-span-12'
                    }
                  >
                    <h2 className="text-headline font-serif">{feature.artisan.shopName}</h2>
                    {feature.artisan.location && (
                      <p className="text-muted-foreground text-sm">{feature.artisan.location}</p>
                    )}
                    {feature.editorialText && (
                      <p className="max-w-xl font-serif text-lg leading-relaxed">
                        {feature.editorialText}
                      </p>
                    )}
                    <Link
                      href={studioPath(feature.artisan.shopSlug)}
                      className={buttonVariants({ variant: 'outline' })}
                    >
                      Visit the studio →
                    </Link>
                  </div>
                </div>
              )}
              {feature.works.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-muted-foreground mb-6 text-sm tracking-wider uppercase">
                    Selected works
                  </h3>
                  <ProductGrid cols={4} stagger>
                    {feature.works.map((w) => (
                      <ProductCard
                        key={w.id}
                        product={{
                          id: w.id,
                          slug: w.slug,
                          title: w.title,
                          price: w.price,
                          currency: w.currency,
                        }}
                        artisan={{ shopSlug: w.artisanShopSlug, shopName: w.artisanShopName }}
                        primaryImage={w.primaryImage}
                        isSignedIn={false}
                      />
                    ))}
                  </ProductGrid>
                </div>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {/* Featured artisans */}
      <section id="artisans" className="py-section mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal variant="soft">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-headline font-serif">Featured artisans</h2>
            {/* Thin-count rule (T12): a "2 studios" headline advertises the
                cold start. The grid speaks for itself until the count does. */}
            {!isThinCount(featuredArtisans.length) && (
              <p className="text-muted-foreground text-sm">
                {featuredArtisans.length} {featuredArtisans.length === 1 ? 'studio' : 'studios'}
              </p>
            )}
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
            <StaggerGrid className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
              {featuredArtisans.map((a) => (
                <StaggerGridItem key={a.id}>
                  <ArtisanCard artisan={a} productCount={a.productCount} />
                </StaggerGridItem>
              ))}
            </StaggerGrid>
          )}
        </Reveal>
      </section>

      {/* Recent listings */}
      <section id="recent" className="bg-secondary/40 border-t">
        <div className="py-section mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal variant="soft">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-headline font-serif">
                {onFirstPage ? 'Recent listings' : 'More listings'}
              </h2>
              {!onFirstPage && (
                <Link
                  href="/#recent"
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  ← Back to most recent
                </Link>
              )}
            </div>
            <RecentListingsSection
              recent={recent}
              isSignedIn={false}
              wishlistedIds={new Set()}
              nextHref={recent.nextCursor ? `/?cursor=${recent.nextCursor}#recent` : null}
            />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
