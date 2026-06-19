import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles } from '@/db/schema';
import { buttonVariants } from '@/components/ui/button';
import { ProductCard } from '@/components/marketplace/product-card';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { getAppreciationCounts } from '@/lib/queries/appreciations';
import type { RecentProductRow } from '@/lib/queries/products';
import { bucketLabel, getSellerReputationsForArtisans } from '@/lib/queries/seller-reputation';
import type { Page } from '@/lib/queries/paginate';

/**
 * Recent-listings grid with seller response-time labels. Shared by the
 * signed-out landing, the signed-in home discovery strip, and the dedicated
 * /browse page so the reputation/appreciation batch lookups live once.
 *
 * `nextHref` is the caller-built URL for the cursor-paginated "Next →" link
 * (each caller owns its own route + anchor). Omit it — as the home discovery
 * strip does — to render a bounded teaser with no inline pagination; that
 * strip links to /browse for deep browsing instead.
 */
export async function RecentListingsSection({
  recent,
  isSignedIn,
  wishlistedIds,
  nextHref,
  stagger = false,
}: {
  recent: Page<RecentProductRow>;
  isSignedIn: boolean;
  wishlistedIds: Set<string>;
  nextHref?: string | null;
  stagger?: boolean;
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
    return (
      <p className="text-muted-foreground">
        The first pieces are still on the wheel.{' '}
        <Link
          href="/sign-up?intent=seller"
          className="text-foreground underline underline-offset-4"
        >
          Share your work on Balikha
        </Link>{' '}
        and open the catalog.
      </p>
    );
  }

  return (
    <>
      <ProductGrid cols={4} stagger={stagger}>
        {recent.items.map((p) => {
          const profileId = profileIdBySlug.get(p.artisanShopSlug);
          const bucket = profileId
            ? reputationByProfileId.get(profileId)?.responseTimeBucket
            : null;
          return (
            <ProductCard
              key={p.id}
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
          );
        })}
      </ProductGrid>

      {nextHref && (
        <div className="mt-12 flex justify-center">
          <Link href={nextHref} className={buttonVariants({ variant: 'outline' })}>
            Next →
          </Link>
        </div>
      )}
    </>
  );
}
