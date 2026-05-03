import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AccountShell } from '@/components/account/account-shell';

// proxy.ts already gates /account on cookie presence; this DB-backed check
// is defense in depth + the source of the user object the layout needs.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=/account');

  // Layout-level fetch of the unread count so the sidebar badge stays in
  // sync per page render. Single index hit on the partial-unread index.
  const [unread] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return (
    <>
      <SiteHeader />
      <AccountShell unreadCount={unread?.value ?? 0}>{children}</AccountShell>
      <SiteFooter />
    </>
  );
}
