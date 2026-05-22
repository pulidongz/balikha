import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getCurrentArtisanProfile } from '@/lib/auth-helpers';
import { getPendingOrdersCount } from '@/lib/queries/orders';
import { getUnreadMessagesCount } from '@/lib/queries/messaging';

// Layout-level fetch of the pending-orders count + unread messages
// count so the sidebar badges stay in sync per page render. Mirrors
// the buyer-account layout's notifications-unread pattern. Skipped
// when the viewer has no artisan profile (they're either on
// /dashboard or become-seller).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentArtisanProfile();
  const [pendingOrdersCount, unreadMessagesCount] = await Promise.all([
    profile ? getPendingOrdersCount(profile.id) : 0,
    profile ? getUnreadMessagesCount(profile.userId) : 0,
  ]);

  return (
    <DashboardShell
      pendingOrdersCount={pendingOrdersCount}
      unreadMessagesCount={unreadMessagesCount}
    >
      {children}
    </DashboardShell>
  );
}
