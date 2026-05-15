'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

// Buyer filter set mirrors the seller's per the plan, minus the
// "awaiting response" tab (that's a seller-specific surface). Default
// to 'in_progress' since that's the most actionable view for a buyer.
export type BuyerOrderListFilter = 'all' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';

const TABS: readonly { value: BuyerOrderListFilter; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
];

export function BuyerOrderListFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // No explicit ?status → default to in_progress per the plan. Other
  // values pass through verbatim and the server validates.
  const current = (searchParams.get('status') as BuyerOrderListFilter | null) ?? 'in_progress';

  function hrefFor(value: BuyerOrderListFilter): string {
    // 'in_progress' is the default — render the canonical no-query URL
    // for it so back/forward and bookmarks stay clean.
    if (value === 'in_progress') return pathname;
    return `${pathname}?status=${value}`;
  }

  return (
    <nav aria-label="Order filters" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const active = current === tab.value;
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
