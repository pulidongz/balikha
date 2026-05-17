'use client';

import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';

/**
 * Site-wide search entry point. Submit-and-go: pressing Enter navigates
 * to `/search?q=...`. The URL IS the API — the form's GET action handles
 * navigation natively, no JS click handler required.
 *
 * Uncontrolled input. The `key` is bound to the URL's `q`, so when the
 * user navigates back/forward (or clicks a link that changes the URL),
 * React remounts the input with a fresh `defaultValue` matching the
 * current URL. Without this, the input would go blank on Back even
 * though the URL still has a query.
 *
 * (We could mirror searchParams into state via useEffect, but the
 * project's lint rules forbid setState-in-effect. Uncontrolled-with-key
 * is the React-canonical alternative for "reset state when an external
 * value changes".)
 */
export function SearchBar({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';

  return (
    <form role="search" action="/search" method="get" className={className}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          key={q}
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search pieces, artisans..."
          aria-label="Search the marketplace"
          className="h-10 pl-9"
        />
      </div>
    </form>
  );
}
