'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Folder, LayoutDashboard, MessageCircle, Settings, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Overview', Icon: LayoutDashboard, exact: true },
  { href: '/dashboard/orders', label: 'Orders', Icon: ShoppingBag, exact: false },
  { href: '/dashboard/messages', label: 'Messages', Icon: MessageCircle, exact: false },
  { href: '/dashboard/catalogs', label: 'Catalogs', Icon: Folder, exact: false },
  { href: '/dashboard/settings', label: 'Settings', Icon: Settings, exact: false },
] as const;

// Counts are optional with default 0 so this component renders cleanly
// in the mobile sheet (DashboardHeaderMenu) and the desktop sidebar
// alike. Both surfaces now thread the real values through.
export function DashboardNav({
  pendingOrdersCount = 0,
  unreadMessagesCount = 0,
  onNavigate,
}: {
  pendingOrdersCount?: number;
  unreadMessagesCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        let badgeCount = 0;
        if (href === '/dashboard/orders') badgeCount = pendingOrdersCount;
        if (href === '/dashboard/messages') badgeCount = unreadMessagesCount;
        const showBadge = badgeCount > 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-secondary text-foreground font-medium'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {showBadge && (
              <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
