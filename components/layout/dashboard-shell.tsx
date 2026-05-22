import type { ReactNode } from 'react';
import { DashboardHeader } from './dashboard-header';
import { DashboardSidebar } from './dashboard-sidebar';

export function DashboardShell({
  pendingOrdersCount,
  unreadMessagesCount,
  children,
}: {
  pendingOrdersCount: number;
  unreadMessagesCount: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        pendingOrdersCount={pendingOrdersCount}
        unreadMessagesCount={unreadMessagesCount}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <DashboardSidebar
          pendingOrdersCount={pendingOrdersCount}
          unreadMessagesCount={unreadMessagesCount}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
