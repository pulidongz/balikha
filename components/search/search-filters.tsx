'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductFilters } from '@/lib/search/types';

interface Props {
  query: string;
  availableMaterials: string[];
  currentFilters: ProductFilters;
  /** Optional callback fired after Apply/Reset — used by the mobile sheet
   *  wrapper to close itself. */
  onApply?: () => void;
}

/**
 * Filter form for /search. Submitting (Apply) or Reset pushes a new URL,
 * which re-renders the server component with new filters applied. State
 * lives entirely in the URL — there's no client-only filter state. This
 * makes filter URLs shareable, the back button work correctly, and avoids
 * the synchronization bugs that come with mirroring URL state into hooks.
 */
export function SearchFilters({ query, availableMaterials, currentFilters, onApply }: Props) {
  const router = useRouter();

  function buildAndPush(params: URLSearchParams) {
    router.push(`/search?${params.toString()}`);
    onApply?.();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    params.set('q', query);

    const materials = formData
      .getAll('materials')
      .filter((v): v is string => typeof v === 'string');
    if (materials.length) params.set('materials', materials.join(','));

    const priceMin = formData.get('priceMin');
    if (typeof priceMin === 'string' && priceMin.trim()) params.set('priceMin', priceMin.trim());

    const priceMax = formData.get('priceMax');
    if (typeof priceMax === 'string' && priceMax.trim()) params.set('priceMax', priceMax.trim());

    if (formData.get('inStockOnly')) params.set('inStockOnly', '1');

    buildAndPush(params);
  }

  function handleReset() {
    buildAndPush(new URLSearchParams({ q: query }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      // Keying on the canonical filter signature remounts the form when
      // the URL changes from outside (e.g. clicking a different search
      // result). Without this, defaultValue/defaultChecked would go stale.
      key={JSON.stringify({ query, ...currentFilters })}
    >
      {availableMaterials.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Materials</legend>
          <div className="space-y-1.5">
            {availableMaterials.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="materials"
                  value={m}
                  defaultChecked={currentFilters.materials?.includes(m) ?? false}
                  className="h-4 w-4 accent-current"
                />
                <span className="capitalize">{m}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Price (PHP)</legend>
        <div className="flex items-center gap-2">
          <Input
            name="priceMin"
            type="number"
            inputMode="numeric"
            placeholder="Min"
            min={0}
            defaultValue={currentFilters.priceMin ?? ''}
            className="h-9"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            name="priceMax"
            type="number"
            inputMode="numeric"
            placeholder="Max"
            min={0}
            defaultValue={currentFilters.priceMax ?? ''}
            className="h-9"
          />
        </div>
      </fieldset>

      <fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="inStockOnly"
            defaultChecked={currentFilters.inStockOnly ?? false}
            className="h-4 w-4 accent-current"
          />
          In stock only
        </label>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}
