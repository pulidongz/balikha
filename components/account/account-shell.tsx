import type { ReactNode } from 'react';
import { AccountSidebar } from './account-sidebar';
import { AccountMobileNav } from './account-mobile-nav';

// The buyer surface deliberately reuses the public <SiteHeader/> + <SiteFooter/>
// from the (account) layout — visually it should feel like the rest of the
// marketplace, not like an admin panel. This shell only owns the sidebar +
// content grid.
export function AccountShell({
  unreadNotifications,
  unreadMessages,
  children,
}: {
  unreadNotifications: number;
  unreadMessages: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[14rem_1fr] lg:px-6 lg:py-12">
      <aside className="hidden lg:block">
        <AccountSidebar unreadNotifications={unreadNotifications} unreadMessages={unreadMessages} />
      </aside>
      <main className="min-w-0">
        <AccountMobileNav
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
        {children}
      </main>
    </div>
  );
}
