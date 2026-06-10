import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { artisanFollows, artisanProfiles } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ArtisanCard } from '@/components/marketplace/artisan-card';
import { FollowToggle } from '@/components/marketplace/follow-toggle';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Following',
};

export default async function FollowingPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/following');

  const list = await db
    .select({
      id: artisanProfiles.id,
      shopSlug: artisanProfiles.shopSlug,
      shopName: artisanProfiles.shopName,
      location: artisanProfiles.location,
      bannerImageUrl: artisanProfiles.bannerImageUrl,
      followedAt: artisanFollows.createdAt,
    })
    .from(artisanFollows)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, artisanFollows.artisanProfileId))
    .where(eq(artisanFollows.userId, current.id))
    .orderBy(desc(artisanFollows.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Following</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {list.length === 0
            ? "You're not following anyone yet."
            : `${list.length} ${list.length === 1 ? 'studio' : 'studios'}`}
        </p>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="No follows yet"
          description="Follow an artisan to see their new listings on your feed."
          action={
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {list.map((a) => (
            <li key={a.id} className="space-y-3">
              <ArtisanCard artisan={a} />
              <FollowToggle artisanProfileId={a.id} initiallyFollowing isSignedIn />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
