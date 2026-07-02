import { and, count, desc, eq, isNull, not, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanFollows,
  artisanProfiles,
  notifications,
  products,
  wishlistItems,
} from '@/db/schema';
import { attachPrimaryImages } from './product-images';

// "Not a new_message notification" — the predicate that defines what
// the general Notifications surface owns. Shared across the layout
// badge count, the page query, the preview helper below, and the
// markAllReadAction so a future notification type that should be
// excluded gets added once.
export const notNewMessage = not(eq(notifications.type, 'new_message'));

// Helpers powering the new content-rich /account landing. Each one is a
// SLICE of the dedicated page's data, not a separate query path — the
// dedicated pages stay the source of truth. Convention from the buyer-
// dashboard plan §4: "Preview sections defer to dedicated pages."
//
// Each helper is idempotent + cheap (small LIMITs, indexed predicates).
// They're meant to fan out via Promise.all from the landing page so the
// total wall-time is dominated by the slowest single query.

export interface PreviewProductItem {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works (T3) — preview cards show no price.
  price: string | null;
  currency: string;
  artisanShopSlug: string;
  artisanShopName: string;
  primaryImage: { url: string; altText: string | null } | null;
}

// Most-recent published products from artisans the buyer follows. Cap at
// 6 — enough to fill a 3-up grid on tablet/desktop without dominating
// the landing.
export async function getFeedPreview(userId: string): Promise<PreviewProductItem[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(artisanFollows, eq(artisanFollows.artisanProfileId, artisanProfiles.id))
    .where(and(eq(artisanFollows.userId, userId), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt))
    .limit(6);

  return attachPrimaryImages(rows);
}

// Most-recently saved wishlist items. Same shape as the dedicated
// /account/wishlist page query, but limited to 4. Doesn't filter on
// product status — if a buyer wishlisted something that's now archived
// they should still see it (consistent with the dedicated page).
export async function getWishlistPreview(userId: string): Promise<PreviewProductItem[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .innerJoin(artisanProfiles, eq(products.artisanProfileId, artisanProfiles.id))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(4);

  return attachPrimaryImages(rows);
}

// Layout-badge counterpart to getUnreadBuyerMessagesCount: the count of
// unread non-message notifications powering the sidebar "Notifications"
// badge. Lives here (not in the layout) so the four sites that share
// the predicate go through one helper or the shared expression above.
export async function getUnreadNonMessageNotificationsCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), notNewMessage));
  return row?.value ?? 0;
}

export interface NotificationPreviewItem {
  id: string;
  title: string;
  body: string | null;
  target: { kind: string; id: string; url?: string } | null;
  readAt: Date | null;
  createdAt: Date;
}

// 3 most-recent notifications, preferring unread. If unread count >= 3
// we just return the unread ones. If not, we backfill with the most
// recent read notifications so the section is never half-empty when
// activity exists.
//
// Strategy: order by (read_at IS NULL DESC, created_at DESC), limit 3.
// `read_at IS NULL` evaluates to true for unread → sorted ahead of read
// when DESC. Single index-friendly query, no UNION.
export async function getNotificationsPreview(userId: string): Promise<NotificationPreviewItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      target: notifications.target,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), notNewMessage))
    .orderBy(
      // Unread first, then newest first within each group.
      sql`${notifications.readAt} IS NULL DESC`,
      desc(notifications.createdAt),
    )
    .limit(3);

  return rows;
}
