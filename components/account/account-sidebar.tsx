'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Heart,
  Home,
  MapPin,
  Rss,
  ShoppingBag,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  exact: boolean;
}

// Order is editorial, not alphabetical. Discovery surfaces (Home through
// Orders) sit above the separator; configuration surfaces (Addresses,
// Profile) sit below. Home gets exact:true because it lives at /account
// and would otherwise highlight on every /account/* page.
const CONTENT_NAV: readonly NavItem[] = [
  { href: '/account', label: 'Home', Icon: Home, exact: true },
  { href: '/account/feed', label: 'New listings', Icon: Rss, exact: false },
  { href: '/account/wishlist', label: 'Wishlist', Icon: Heart, exact: false },
  { href: '/account/following', label: 'Following', Icon: Users, exact: false },
  { href: '/account/notifications', label: 'Notifications', Icon: Bell, exact: false },
  { href: '/account/orders', label: 'Orders', Icon: ShoppingBag, exact: false },
];
const CONFIG_NAV: readonly NavItem[] = [
  { href: '/account/addresses', label: 'Addresses', Icon: MapPin, exact: false },
  { href: '/account/profile', label: 'Profile', Icon: User, exact: false },
];

interface Props {
  unreadCount: number;
  onNavigate?: () => void;
}

export function AccountSidebar({ unreadCount, onNavigate }: Props) {
  const pathname = usePathname();

  function renderItem({ href, label, Icon, exact }: NavItem) {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    const showBadge = href === '/account/notifications' && unreadCount > 0;
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
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {CONTENT_NAV.map((item) => (
        <Fragment key={item.href}>{renderItem(item)}</Fragment>
      ))}
      {/* Subtle separator between content surfaces and configuration —
          communicates the difference in "kind" without being loud. */}
      <div className="border-border/50 my-2 border-t" aria-hidden="true" />
      {CONFIG_NAV.map((item) => (
        <Fragment key={item.href}>{renderItem(item)}</Fragment>
      ))}
    </nav>
  );
}
