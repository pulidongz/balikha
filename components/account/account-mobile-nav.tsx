'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Plain text strip — no icons here. The horizontal scroll affords more
// labels in less vertical space than icons-with-text would.
const ITEMS = [
  { href: '/account/profile', label: 'Profile', exact: false },
  { href: '/account/addresses', label: 'Addresses', exact: false },
  { href: '/account/wishlist', label: 'Wishlist', exact: false },
  { href: '/account/following', label: 'Following', exact: false },
  { href: '/account/feed', label: 'New listings', exact: false },
  { href: '/account/notifications', label: 'Notifications', exact: false },
  { href: '/account/orders', label: 'Orders', exact: false },
] as const;

export function AccountMobileNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Account sections"
      className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden"
    >
      {ITEMS.map(({ href, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        const showBadge = href === '/account/notifications' && unreadCount > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-foreground text-background border-foreground'
                : 'text-muted-foreground border-border hover:text-foreground',
            )}
          >
            <span>{label}</span>
            {showBadge && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums',
                  active ? 'bg-background text-foreground' : 'bg-accent text-accent-foreground',
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
