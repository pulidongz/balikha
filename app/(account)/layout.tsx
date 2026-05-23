import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getUnreadNonMessageNotificationsCount } from '@/lib/queries/account';
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
  //    /account/messages will render).
  const [unreadNotifications, unreadMessages] = await Promise.all([
    getUnreadNonMessageNotificationsCount(user.id),
    getUnreadBuyerMessagesCount(user.id),
  ]);

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
