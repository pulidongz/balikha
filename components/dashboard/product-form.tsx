'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createProductAction, updateProductAction } from '@/lib/actions/product';

// Prices display with thousands separators ("1,200.00"). Formatting happens
// on blur — never mid-keystroke — so the caret never jumps. A value that is
// not a clean number is left untouched for the server validator to flag.
function formatPriceForDisplay(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '') return '';
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return raw;
  return Number(cleaned).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type CreateMode = { mode: 'create'; catalogId: string; catalogSlug: string };
type EditMode = {
  mode: 'edit';
  productId: string;
  defaults: {
    title: string;
    description: string | null;
    price: string;
    currency: string;
    stockOnHand: number;
    weightGrams: number | null;
    materials: string[] | null;
    dimensions: { width?: number; height?: number; depth?: number; unit?: 'cm' | 'in' } | null;
  };
};

export function ProductForm(props: CreateMode | EditMode) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  const isEdit = props.mode === 'edit';
  const d = isEdit ? props.defaults : null;
  // Controlled so the price can be reformatted with commas on blur.
  const [price, setPrice] = useState(() => formatPriceForDisplay(d?.price ?? ''));

  return (
    <form
      noValidate
      className="space-y-4"
      action={(formData) => {
        setError(null);
        setFieldErrors({});
        startTransition(async () => {
          if (props.mode === 'edit') {
            const result = await updateProductAction(props.productId, formData);
            if (!result.ok) {
              setError(result.error);
              setFieldErrors(result.fieldErrors ?? {});
              return;
            }
            router.refresh();
          } else {
            const result = await createProductAction(props.catalogId, formData);
            if (!result.ok) {
              setError(result.error);
              setFieldErrors(result.fieldErrors ?? {});
              return;
            }
            // Land on the new product's edit page — that is where images are added.
            router.push(`/dashboard/catalogs/${props.catalogSlug}/products/${result.data.slug}`);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="product-title">Title</Label>
        <Input
          id="product-title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          defaultValue={d?.title}
          aria-invalid={fieldError('title') ? true : undefined}
        />
        {fieldError('title') && <p className="text-destructive text-xs">{fieldError('title')}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-description">Description</Label>
        <Textarea
          id="product-description"
          name="description"
          rows={4}
          defaultValue={d?.description ?? ''}
          aria-invalid={fieldError('description') ? true : undefined}
        />
        {fieldError('description') && (
          <p className="text-destructive text-xs">{fieldError('description')}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="product-price">Price</Label>
          <Input
            id="product-price"
            name="price"
            inputMode="decimal"
            placeholder="0.00"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={(e) => setPrice(formatPriceForDisplay(e.target.value))}
            aria-invalid={fieldError('price') ? true : undefined}
          />
          {fieldError('price') && <p className="text-destructive text-xs">{fieldError('price')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-currency">Currency</Label>
          <Input
            id="product-currency"
            name="currency"
            maxLength={3}
            defaultValue={d?.currency ?? 'PHP'}
            aria-invalid={fieldError('currency') ? true : undefined}
          />
          {fieldError('currency') && (
            <p className="text-destructive text-xs">{fieldError('currency')}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-stock">Stock on hand</Label>
          <Input
            id="product-stock"
            name="stockOnHand"
            type="number"
            min={0}
            step={1}
            defaultValue={d?.stockOnHand ?? 0}
            aria-invalid={fieldError('stockOnHand') ? true : undefined}
          />
          {fieldError('stockOnHand') && (
            <p className="text-destructive text-xs">{fieldError('stockOnHand')}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-materials">Materials (comma-separated)</Label>
        <Input
          id="product-materials"
          name="materials"
          placeholder="stoneware, glaze, oxide"
          defaultValue={d?.materials?.join(', ') ?? ''}
          aria-invalid={fieldError('materials') ? true : undefined}
        />
        {fieldError('materials') && (
          <p className="text-destructive text-xs">{fieldError('materials')}</p>
        )}
      </div>

      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="text-sm font-medium">Dimensions</legend>
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label htmlFor="product-width" className="text-xs">
              Width
            </Label>
            <Input
              id="product-width"
              name="width"
              type="number"
              step="0.1"
              min={0}
              defaultValue={d?.dimensions?.width ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-height" className="text-xs">
              Height
            </Label>
            <Input
              id="product-height"
              name="height"
              type="number"
              step="0.1"
              min={0}
              defaultValue={d?.dimensions?.height ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-depth" className="text-xs">
              Depth
            </Label>
            <Input
              id="product-depth"
              name="depth"
              type="number"
              step="0.1"
              min={0}
              defaultValue={d?.dimensions?.depth ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-unit" className="text-xs">
              Unit
            </Label>
            <select
              id="product-unit"
              name="unit"
              defaultValue={d?.dimensions?.unit ?? 'cm'}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
        </div>
        {fieldError('dimensions') && (
          <p className="text-destructive text-xs">{fieldError('dimensions')}</p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="product-weight">Weight (grams, optional)</Label>
        <Input
          id="product-weight"
          name="weightGrams"
          type="number"
          min={0}
          step={1}
          defaultValue={d?.weightGrams ?? ''}
          aria-invalid={fieldError('weightGrams') ? true : undefined}
        />
        {fieldError('weightGrams') && (
          <p className="text-destructive text-xs">{fieldError('weightGrams')}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
      </Button>
    </form>
  );
}
