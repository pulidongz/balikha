'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  disabled: boolean;
  exact: boolean;
}

// Disabled items are intentional roadmap slots. Each one corresponds to a
// future plan; flip `disabled: false` and add the route as features ship.
// Don't stub fake routes for them — empty admin pages are worse than no link.
const NAV: readonly NavItem[] = [
  { href: '/admin', label: 'Overview', disabled: false, exact: true },
  { href: '/admin/users', label: 'Users', disabled: true, exact: false },
  { href: '/admin/products', label: 'Products', disabled: true, exact: false },
  { href: '/admin/search', label: 'Search analytics', disabled: false, exact: false },
  { href: '/admin/audit-log', label: 'Audit log', disabled: true, exact: false },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="bg-card rounded-md border p-2">
      <ul className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          if (item.disabled) {
            return (
              <li
                key={item.href}
                className="text-muted-foreground flex cursor-not-allowed items-center justify-between rounded-sm px-3 py-2 text-sm"
              >
                <span>{item.label}</span>
                <span className="bg-muted rounded-full px-1.5 py-0.5 text-[0.6rem] tracking-widest uppercase opacity-60">
                  soon
                </span>
              </li>
            );
          }
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'block rounded-sm px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-foreground hover:bg-secondary/60',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
