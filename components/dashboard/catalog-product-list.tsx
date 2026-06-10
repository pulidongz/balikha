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

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works (T3) — the row shows the sales
  // mode instead of a price.
  price: string | null;
  currency: string;
  salesMode: 'for_sale' | 'showcase' | 'commission_inquiries';
  stockOnHand: number;
  status: ProductStatus;
}

const SALES_MODE_LABEL: Record<ProductRow['salesMode'], string> = {
  for_sale: 'For sale',
  showcase: 'Showcase',
  commission_inquiries: 'Commissions',
};

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
  approvalStatus,
}: {
  catalogSlug: string;
  products: ProductRow[];
  approvalStatus: ApprovalStatus;
}) {
  const canPublish = approvalStatus === 'approved';
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
            <Button
              size="sm"
              onClick={() => applyStatus('published')}
              disabled={pending || !canPublish}
              title={
                !canPublish
                  ? 'Your artist account must be approved before you can publish products.'
                  : undefined
              }
            >
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
            {someSelected
              ? `${selected.size} of ${products.length} selected`
              : 'Select products to publish, change status, or archive (remove from storefront)'}
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
                  <p className="text-muted-foreground text-xs">
                    {p.salesMode === 'for_sale'
                      ? `${p.stockOnHand} in stock`
                      : SALES_MODE_LABEL[p.salesMode]}
                  </p>
                </div>
                {p.price !== null && <PriceTag price={p.price} currency={p.currency} size="sm" />}
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
