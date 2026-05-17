import Link from 'next/link';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/format';
import type { ProductFilters } from '@/lib/search/types';

interface Props {
  query: string;
  currentFilters: ProductFilters;
}

// A single active filter, resolved to its display label and the set of URL
// params it owns. Removing the chip drops every param in `paramKeys` while
// preserving the query and every other active filter.
interface ActiveFilter {
  key: string;
  label: string;
  paramKeys: string[];
}

/**
 * Builds a /search URL carrying `query` and every active filter EXCEPT the
 * params in `drop`. Pagination params (cursor/limit) are intentionally not
 * carried — removing a filter changes the result set, so the first page is
 * the correct landing point.
 */
function buildUrlWithout(query: string, filters: ProductFilters, drop: string[]): string {
  const params = new URLSearchParams();
  params.set('q', query);

  if (!drop.includes('materials') && filters.materials?.length) {
    params.set('materials', filters.materials.join(','));
  }
  if (!drop.includes('priceMin') && filters.priceMin !== undefined) {
    params.set('priceMin', String(filters.priceMin));
  }
  if (!drop.includes('priceMax') && filters.priceMax !== undefined) {
    params.set('priceMax', String(filters.priceMax));
  }
  if (!drop.includes('inStockOnly') && filters.inStockOnly) {
    params.set('inStockOnly', '1');
  }

  return `/search?${params.toString()}`;
}

// Renders the price filter as one chip. Min-only, max-only, and range each
// read naturally, and removing the chip clears both price params at once.
function priceLabel(min?: number, max?: number): string | null {
  const hasMin = min !== undefined;
  const hasMax = max !== undefined;
  if (hasMin && hasMax) {
    return `${formatPrice(String(min), 'PHP')} to ${formatPrice(String(max), 'PHP')}`;
  }
  if (hasMax) return `Under ${formatPrice(String(max), 'PHP')}`;
  if (hasMin) return `Over ${formatPrice(String(min), 'PHP')}`;
  return null;
}

function getActiveFilters(filters: ProductFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  for (const material of filters.materials ?? []) {
    active.push({
      key: `material:${material}`,
      label: `Material: ${material}`,
      // A material chip removes only its own value; other materials and
      // the rest of the filters stay. The URL is rebuilt per-chip below.
      paramKeys: ['materials'],
    });
  }

  const price = priceLabel(filters.priceMin, filters.priceMax);
  if (price) {
    active.push({ key: 'price', label: price, paramKeys: ['priceMin', 'priceMax'] });
  }

  if (filters.inStockOnly) {
    active.push({ key: 'inStockOnly', label: 'In stock', paramKeys: ['inStockOnly'] });
  }

  return active;
}

/**
 * A quiet row of removable chips summarizing the active search filters.
 * Server component: it takes the already-parsed filters and renders plain
 * navigation links, so removing a filter is a normal page navigation with
 * no client state. Renders nothing when no filters are active.
 *
 * This is the visible record of "what is filtering my results" — it earns
 * its keep on mobile, where the filter form lives behind a closed Sheet.
 */
export function ActiveFilterChips({ query, currentFilters }: Props) {
  const active = getActiveFilters(currentFilters);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">Filters</span>
      {active.map((filter) => {
        // Per-material removal: drop just this material, keep the others.
        const removeUrl =
          filter.key.startsWith('material:') && currentFilters.materials
            ? buildMaterialRemovalUrl(query, currentFilters, filter.key.slice('material:'.length))
            : buildUrlWithout(query, currentFilters, filter.paramKeys);

        return (
          <Badge
            key={filter.key}
            variant="secondary"
            render={<Link href={removeUrl} />}
            aria-label={`Remove filter ${filter.label}`}
          >
            <span className="capitalize">{filter.label}</span>
            <X aria-hidden className="size-3" />
          </Badge>
        );
      })}
      <Link
        href={`/search?${new URLSearchParams({ q: query }).toString()}`}
        className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}

// Drops a single material from the comma-separated `materials` param while
// preserving every other filter and any remaining materials.
function buildMaterialRemovalUrl(query: string, filters: ProductFilters, material: string): string {
  const remaining = (filters.materials ?? []).filter((m) => m !== material);
  return buildUrlWithout(query, { ...filters, materials: remaining }, []);
}
