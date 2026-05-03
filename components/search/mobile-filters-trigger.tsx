'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { ProductFilters } from '@/lib/search/types';
import { SearchFilters } from './search-filters';

/**
 * Below `lg:` the desktop filter sidebar is hidden; this button replaces
 * it. Clicking opens a Sheet drawer with the same SearchFilters form.
 * onApply closes the sheet so the page navigation result is visible
 * immediately rather than behind the open drawer.
 */
export function MobileFiltersTrigger(props: {
  query: string;
  availableMaterials: string[];
  currentFilters: ProductFilters;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'lg:hidden',
        })}
      >
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        Filters
      </SheetTrigger>
      <SheetContent side="left" className="w-[80vw] max-w-sm overflow-y-auto sm:w-[360px]">
        <SheetHeader>
          <SheetTitle className="font-serif text-lg">Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <SearchFilters {...props} onApply={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
