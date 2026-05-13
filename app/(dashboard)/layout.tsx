import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getCurrentArtisanProfile } from '@/lib/auth-helpers';
import { getPendingOrdersCount } from '@/lib/queries/orders';

// Layout-level fetch of the pending-response count so the sidebar
// badge stays in sync per page render. Mirrors the buyer-account
// layout's notifications-unread pattern. Skipped when the viewer has
// no artisan profile (they're either on /dashboard or become-seller).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentArtisanProfile();
  const pendingOrdersCount = profile ? await getPendingOrdersCount(profile.id) : 0;

  return <DashboardShell pendingOrdersCount={pendingOrdersCount}>{children}</DashboardShell>;
}
