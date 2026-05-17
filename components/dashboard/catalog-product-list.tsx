'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PriceTag } from '@/components/marketplace/price-tag';
import { setProductsStatusAction } from '@/lib/actions/product';
import { cn } from '@/lib/utils';

type ProductStatus = 'draft' | 'published' | 'sold_out' | 'archived';

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  stockOnHand: number;
  status: ProductStatus;
}

const STATUS_VARIANT: Record<ProductStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  published: 'default',
  sold_out: 'secondary',
  archived: 'secondary',
};

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  sold_out: 'Sold out',
  archived: 'Archived',
};

// The catalog's product list with multi-select. A checkbox per row sits
// as a sibling of the row link, never nested inside it, so selecting a
// product never triggers navigation. Selecting one or more rows reveals
// a bulk bar that applies a single status to every selected product in
// one server round-trip. Archive routes through ConfirmDialog; the other
// actions apply directly.
export function CatalogProductList({
  catalogSlug,
  products,
}: {
  catalogSlug: string;
  products: ProductRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<ProductStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const allSelected = products.length > 0 && selected.size === products.length;
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id)),
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function applyStatus(status: ProductStatus) {
    setError(null);
    setPendingStatus(status);
    startTransition(async () => {
      const result = await setProductsStatusAction([...selected], status);
      setPendingStatus(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clearSelection();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {someSelected && (
        <div className="bg-secondary/50 flex flex-wrap items-center gap-2 rounded-md border p-2">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => applyStatus('published')} disabled={pending}>
              {pending && pendingStatus === 'published' ? 'Publishing…' : 'Publish'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus('draft')}
              disabled={pending}
            >
              {pending && pendingStatus === 'draft' ? 'Moving…' : 'Move to draft'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => applyStatus('sold_out')}
              disabled={pending}
            >
              {pending && pendingStatus === 'sold_out' ? 'Updating…' : 'Sold out'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveOpen(true)}
              disabled={pending}
            >
              Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={pending}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all products"
            className="size-4 shrink-0"
          />
          <span className="text-muted-foreground text-xs">
            {someSelected ? `${selected.size} of ${products.length} selected` : 'Select all'}
          </span>
        </li>
        {products.map((p) => {
          const isSelected = selected.has(p.id);
          return (
            <li
              key={p.id}
              className={cn('flex items-center gap-3 pr-4 pl-3', isSelected && 'bg-secondary/40')}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(p.id)}
                aria-label={`Select ${p.title}`}
                className="size-4 shrink-0"
              />
              <Link
                href={`/dashboard/catalogs/${catalogSlug}/products/${p.slug}`}
                className="hover:bg-secondary/50 flex flex-1 items-center gap-4 py-4 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-serif text-lg leading-tight">{p.title}</h3>
                  <p className="text-muted-foreground text-xs">{p.stockOnHand} in stock</p>
                </div>
                <PriceTag price={p.price} currency={p.currency} size="sm" />
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </Link>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${selected.size} ${selected.size === 1 ? 'product' : 'products'}?`}
        description="Archiving takes them off your storefront, so buyers can no longer see or order them. You can move them back to draft anytime."
        confirmLabel="Archive products"
        pendingLabel="Archiving…"
        onConfirm={() => setProductsStatusAction([...selected], 'archived')}
        onSuccess={() => {
          clearSelection();
          router.refresh();
        }}
      />
    </div>
  );
}
