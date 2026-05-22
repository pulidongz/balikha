import { DashboardNav } from './dashboard-nav';

export function DashboardSidebar({
  pendingOrdersCount,
  unreadMessagesCount,
}: {
  pendingOrdersCount: number;
  unreadMessagesCount: number;
}) {
  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 border-r p-4 lg:block">
      <DashboardNav
        pendingOrdersCount={pendingOrdersCount}
        unreadMessagesCount={unreadMessagesCount}
      />
    </aside>
  );
}
