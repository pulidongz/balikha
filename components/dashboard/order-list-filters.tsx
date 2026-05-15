'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type OrderListFilter =
  | 'all'
  | 'pending_response'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'disputed';

interface FilterTab {
  value: OrderListFilter;
  label: string;
}

const TABS: readonly FilterTab[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_response', label: 'Awaiting response' },
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
];

// URL-driven filter — server component reads ?status and queries; this
// component only renders the tab bar and links. Avoids the trap of
// keeping local state in sync with the URL.
export function OrderListFilters({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = (searchParams.get('status') as OrderListFilter | null) ?? 'all';

  function hrefFor(value: OrderListFilter): string {
    if (value === 'all') return pathname;
    return `${pathname}?status=${value}`;
  }

  return (
    <nav aria-label="Order filters" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const active = current === tab.value;
          const showBadge = tab.value === 'pending_response' && pendingCount > 0;
          return (
            <li key={tab.value}>
              <Link
                href={hrefFor(tab.value)}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                  active
                    ? 'text-foreground border-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                <span>{tab.label}</span>
                {showBadge && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums',
                      active ? 'bg-foreground text-background' : 'bg-accent text-accent-foreground',
                    )}
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
