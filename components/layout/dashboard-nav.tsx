'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Folder, LayoutDashboard, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Overview', Icon: LayoutDashboard, exact: true },
  { href: '/dashboard/catalogs', label: 'Catalogs', Icon: Folder, exact: false },
  { href: '/dashboard/settings', label: 'Settings', Icon: Settings, exact: false },
] as const;

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
