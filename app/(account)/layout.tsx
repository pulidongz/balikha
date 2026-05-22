import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { and, count, eq, isNull, not } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getUnreadBuyerMessagesCount } from '@/lib/queries/messaging';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AccountShell } from '@/components/account/account-shell';

// proxy.ts already gates /account on cookie presence; this DB-backed check
// is defense in depth + the source of the user object the layout needs.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=/account');

  // Layout-level fetch of unread counts so the sidebar badges stay in
  // sync per page render. Two parallel reads:
  //  - notifications excluding new_message (the Notifications badge)
  //  - buyer-side message notifications (the Messages badge — scoped
  //    to threads where this user is the buyer, so it matches what
  //    /account/messages will render; round-3 UX fix).
  const [notificationRows, unreadMessages] = await Promise.all([
    db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
          // Exclude new_message from the "general" notification badge
          // so messages and notifications have distinct, accurate
          // counts.
          not(eq(notifications.type, 'new_message')),
        ),
      ),
    getUnreadBuyerMessagesCount(user.id),
  ]);
  const unreadNotifications = notificationRows[0]?.value ?? 0;

  return (
    <>
      <SiteHeader />
      <AccountShell unreadNotifications={unreadNotifications} unreadMessages={unreadMessages}>
        {children}
      </AccountShell>
      <SiteFooter />
    </>
  );
}
