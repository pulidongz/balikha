import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getFeedPreview, getNotificationsPreview, getWishlistPreview } from '@/lib/queries/account';
import { getRecentlyViewed } from '@/lib/queries/recently-viewed';
import { getWishlistProductIds } from '@/lib/queries/wishlist';
import { FeedPreview } from '@/components/account/feed-preview';
import { WishlistPreview } from '@/components/account/wishlist-preview';
import { NotificationsPreview } from '@/components/account/notifications-preview';
import { FirstTimeBuyerWelcome } from '@/components/account/first-time-buyer-welcome';
import { RecentlyViewedStrip } from '@/components/marketplace/recently-viewed-strip';
import { ResendVerificationBanner } from '@/components/auth/resend-verification-banner';

export const metadata = {
  title: 'Your account',
};

export default async function AccountHome() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account');

  // All five preview-data fetches fan out in parallel — total wall time
  // is dominated by the slowest single query rather than summing them.
  // wishlistedIds is for the feed section's heart hydration; the
  // wishlist preview itself doesn't need it (every shown item is
  // wishlisted by definition).
  const [feedItems, wishlistItems, recentItems, notificationItems, wishlistedIds] =
    await Promise.all([
      getFeedPreview(current.id),
      getWishlistPreview(current.id),
      getRecentlyViewed(current.id, 12),
      getNotificationsPreview(current.id),
      getWishlistProductIds(current.id),
    ]);

  // First-time buyer state: zero activity in any section. Showing four
  // empty sections stacked would feel barren and pushy ("you should do
  // this... and this... and this..."). Replace the whole page with a
  // calmer welcome.
  const isFirstTime =
    feedItems.length === 0 &&
    wishlistItems.length === 0 &&
    recentItems.length === 0 &&
    notificationItems.length === 0;

  if (isFirstTime) {
    return (
      <div className="space-y-8">
        {!current.emailVerified && <ResendVerificationBanner email={current.email} />}
        <FirstTimeBuyerWelcome firstName={current.firstName ?? ''} />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {!current.emailVerified && <ResendVerificationBanner email={current.email} />}
      <header>
        <h1 className="font-serif text-3xl">Hi, {current.firstName}</h1>
      </header>

      <FeedPreview items={feedItems} wishlistedIds={wishlistedIds} />
      <WishlistPreview items={wishlistItems} />
      <RecentlyViewedStrip items={recentItems} minItems={1} />
      <NotificationsPreview items={notificationItems} />
    </div>
  );
}
