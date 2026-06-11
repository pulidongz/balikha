'use client';

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProductImageList, type ImageRow } from '@/components/dashboard/product-image-list';
import { ProductImageUploader } from '@/components/dashboard/product-image-uploader';
import { createProductAction, updateProductAction } from '@/lib/actions/product';
import {
  ACCEPTED_IMAGE_TYPES,
  uploadProductImage,
  validateImageFile,
} from '@/lib/storage/upload-product-image';

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

type SalesMode = 'for_sale' | 'showcase' | 'commission_inquiries';

// The sale question is asked AFTER the work itself (photos, story) — T3's
// showcase-first ordering. Options are deliberately phrased from the
// artist's point of view, not the inventory's.
const SALES_MODE_OPTIONS: ReadonlyArray<{ value: SalesMode; label: string; hint: string }> = [
  { value: 'for_sale', label: 'For sale', hint: 'Set a price and stock; buyers can order it.' },
  {
    value: 'showcase',
    label: 'Showcase only',
    hint: 'Show the work — sold pieces, experiments, work in progress.',
  },
  {
    value: 'commission_inquiries',
    label: 'Open to commission inquiries',
    hint: 'Not for direct sale, but buyers can ask for a piece like it.',
  },
];

type CreateMode = { mode: 'create'; catalogId: string; catalogSlug: string };
type EditMode = {
  mode: 'edit';
  productId: string;
  defaults: {
    title: string;
    description: string | null;
    salesMode: SalesMode;
    price: string | null;
    currency: string;
    stockOnHand: number;
    weightGrams: number | null;
    materials: string[] | null;
    dimensions: { width?: number; height?: number; depth?: number; unit?: 'cm' | 'in' } | null;
    technique: string | null;
    careInstructions: string | null;
  };
  images: ImageRow[];
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
  // Controlled so the commerce fields (price/currency/stock) can reveal
  // only when the work is for sale. Hidden fields submit nothing, so the
  // server stores price NULL / stock 0 for showcase and commission works.
  const [salesMode, setSalesMode] = useState<SalesMode>(d?.salesMode ?? 'for_sale');

  // --- Create-mode photo buffer -------------------------------------------
  // Photos are buffered client-side and uploaded after the product is created
  // (the upload flow needs a productId). Edit mode uploads to the existing
  // product directly, so this buffer state is only exercised when create.
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Mirror the buffer into a ref so the unmount cleanup can revoke every object
  // URL without the effect re-running on each buffer change.
  const imagesRef = useRef<{ file: File; url: string }[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  });
  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)), []);

  function handleFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // let the same file be re-picked later
    const accepted: { file: File; url: string }[] = [];
    const rejected: string[] = [];
    for (const file of picked) {
      const problem = validateImageFile(file);
      if (problem) rejected.push(`${file.name} — ${problem}`);
      else accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
    setImageError(rejected.length > 0 ? rejected.join('; ') : null);
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <form
      noValidate
      className="space-y-6"
      action={(formData) => {
        setError(null);
        setFieldErrors({});
        setImageError(null);
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
            const { slug, productId } = result.data;
            // Upload buffered photos to the new product, one at a time so
            // product_images.position matches the order the seller arranged.
            // A per-file catch keeps one failure from aborting the rest.
            let failed = 0;
            let done = 0;
            for (const img of images) {
              setImageUploadProgress({ done, total: images.length });
              try {
                await uploadProductImage(productId, img.file);
              } catch {
                failed += 1;
              }
              done += 1;
              setImageUploadProgress({ done, total: images.length });
            }
            setImageUploadProgress(null);
            const dest = `/dashboard/catalogs/${props.catalogSlug}/products/${slug}`;
            router.push(failed > 0 ? `${dest}?imagesFailed=${failed}` : dest);
          }
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          {isEdit && <CardDescription>Slug is locked once created.</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
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
            {fieldError('title') && (
              <p className="text-destructive text-xs">{fieldError('title')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">The story</Label>
            <Textarea
              id="product-description"
              name="description"
              rows={5}
              placeholder="What is it? How did you make it? What makes it yours?"
              defaultValue={d?.description ?? ''}
              aria-invalid={fieldError('description') ? true : undefined}
            />
            {/* Soft nudge (T13) — informative, never blocking. */}
            <p className="text-muted-foreground text-xs">
              Works with a story get more appreciations — even three sentences carry it.
            </p>
            {fieldError('description') && (
              <p className="text-destructive text-xs">{fieldError('description')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Photos come before the sale question (T3): the work first, the
          commerce decision after. */}
      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>
            The first photo is the preview buyers see on public pages. A good set: the front, a
            close detail, and one for scale or in context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.mode === 'create' ? (
            <div className="space-y-2">
              <Label htmlFor="product-photos">Add photos</Label>
              <Input
                id="product-photos"
                type="file"
                multiple
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={handleFilesPicked}
                disabled={isPending}
              />
              <p className="text-muted-foreground text-xs">
                JPEG, PNG, WebP, or AVIF; up to 10 MB each.
              </p>
              {/* Soft minimum of three (T13): a nudge, never a block. */}
              {images.length > 0 && images.length < 3 && (
                <p className="text-muted-foreground text-xs">
                  {3 - images.length} more would round out the set — buyers trust pieces they can
                  see from every side.
                </p>
              )}
              {imageError && <p className="text-destructive text-xs">{imageError}</p>}
              {images.length > 0 && (
                <ul className="grid grid-cols-3 gap-3">
                  {images.map((img, index) => (
                    <li key={img.url} className="space-y-1 rounded-md border p-2">
                      <div className="bg-muted relative aspect-square overflow-hidden rounded">
                        <Image
                          src={img.url}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 160px, 30vw"
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => removeImage(index)}
                        disabled={isPending}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ProductImageList images={props.images} />
              <ProductImageUploader productId={props.productId} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Craft details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Label htmlFor="product-technique">Technique</Label>
            <Input
              id="product-technique"
              name="technique"
              placeholder="hand-built, slab construction, reduction fired"
              maxLength={200}
              defaultValue={d?.technique ?? ''}
              aria-invalid={fieldError('technique') ? true : undefined}
            />
            {fieldError('technique') && (
              <p className="text-destructive text-xs">{fieldError('technique')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-care">Care instructions</Label>
            <Textarea
              id="product-care"
              name="careInstructions"
              rows={2}
              placeholder="Hand-wash; avoid sudden temperature changes."
              maxLength={2000}
              defaultValue={d?.careInstructions ?? ''}
              aria-invalid={fieldError('careInstructions') ? true : undefined}
            />
            {fieldError('careInstructions') && (
              <p className="text-destructive text-xs">{fieldError('careInstructions')}</p>
            )}
          </div>

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
        </CardContent>
      </Card>

      {/* The sale question comes last (T3): the work and its story are
          captured first; selling is one option, not the premise. */}
      <Card>
        <CardHeader>
          <CardTitle>Is this for sale?</CardTitle>
          <CardDescription>You can change this anytime, even after publishing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Is this for sale?</legend>
            {SALES_MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="border-input hover:bg-secondary/40 has-checked:bg-secondary/60 has-checked:border-foreground/40 flex cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm transition-colors"
              >
                <input
                  type="radio"
                  name="salesMode"
                  value={opt.value}
                  checked={salesMode === opt.value}
                  onChange={() => setSalesMode(opt.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-muted-foreground block text-xs">{opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {salesMode === 'for_sale' && (
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
                {fieldError('price') && (
                  <p className="text-destructive text-xs">{fieldError('price')}</p>
                )}
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
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending}>
        {imageUploadProgress
          ? `Uploading photos ${imageUploadProgress.done}/${imageUploadProgress.total}…`
          : isPending
            ? 'Saving…'
            : isEdit
              ? 'Save changes'
              : 'Create product'}
      </Button>
    </form>
  );
}
