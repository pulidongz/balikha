import type { Metadata } from 'next';
import { RecentListingsSection } from '@/components/marketplace/recent-listings-section';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getRecentProducts } from '@/lib/queries/products';
import { getWishlistProductIds } from '@/lib/queries/wishlist';

export const metadata: Metadata = {
  title: 'Browse · Balikha',
  description: 'Recent handmade work from independent Filipino artisans on Balikha.',
};

interface BrowsePageProps {
  searchParams: Promise<{ cursor?: string }>;
}

// The catalog surface for everyone — the signed-in home links here from its
// bounded "Recent works across Balikha" strip, and signed-out visitors can
// reach the same full, paginated grid. Cursor-paginated like the landing's
// #recent section; reuses RecentListingsSection so reputation/appreciation
// batching lives in one place.
export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { cursor } = await searchParams;
  const viewer = await getCurrentUser();
  const recent = await getRecentProducts({ cursor });
  const wishlistedIds = await getWishlistProductIds(viewer?.id ?? null);
  const onFirstPage = !cursor;

  return (
    <div className="py-section mx-auto max-w-6xl px-4 sm:px-6">
      <header className="mb-10">
        <h1 className="text-headline font-serif">Recent works across Balikha</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {onFirstPage
            ? 'The latest pieces from every studio, newest first.'
            : 'More pieces, newest first.'}
        </p>
      </header>
      <RecentListingsSection
        recent={recent}
        isSignedIn={viewer !== null}
        wishlistedIds={wishlistedIds}
        nextHref={recent.nextCursor ? `/browse?cursor=${recent.nextCursor}` : null}
        stagger
      />
    </div>
  );
}
