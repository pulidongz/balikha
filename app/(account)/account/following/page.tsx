import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth-helpers';
import { countFollowing, getFollowingPage } from '@/lib/queries/follows';
import { ArtisanCard } from '@/components/marketplace/artisan-card';
import { FollowToggle } from '@/components/marketplace/follow-toggle';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Following',
};

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/following');

  const { cursor } = await searchParams;
  const [page, total] = await Promise.all([
    getFollowingPage(current.id, { cursor }),
    countFollowing(current.id),
  ]);
  const list = page.items;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Following</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {total === 0
            ? "You're not following anyone yet."
            : `${total} ${total === 1 ? 'studio' : 'studios'}`}
        </p>
      </header>

      {total === 0 ? (
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
        <>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {list.map((a) => (
              <li key={a.id} className="space-y-3">
                <ArtisanCard artisan={a} />
                <FollowToggle
                  artisanProfileId={a.id}
                  initiallyFollowing
                  isSignedIn
                  pendingFollowId={null}
                />
              </li>
            ))}
          </ul>

          {page.nextCursor && (
            <div className="mt-12 flex justify-center">
              <Link
                href={`/account/following?cursor=${page.nextCursor}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Next →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
