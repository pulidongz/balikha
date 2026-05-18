# Unified Product Form Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the create and edit product pages share one layout — a Product details card, then a Photos card, then the submit button last — by having `ProductForm` own the whole surface.

**Architecture:** `ProductForm` renders one `<form>` containing a "Product details" card, a "Photos" card, and the submit button. The Photos card holds the create-mode buffer or the edit-mode photo grid + uploader. To embed the image section inside the form without nesting `<form>` elements, `ProductImageUploader` is reworked from a `<form>` into a plain non-form control.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript.

**Testing note:** This project has **no test framework** (`npm run check` is typecheck + lint + format). Verification is `npm run check` plus the manual walk-through in each task. Do not add a test framework.

**Branch/commit policy:** Commit directly to the current branch (`main`) after each task — normal `git commit`, not `--amend`. No feature branch, no PR.

**Reference spec:** `docs/superpowers/specs/2026-05-18-unified-product-form-layout-design.md`

---

### Task 1: Rework `ProductImageUploader` into a non-form control

`ProductImageUploader` is currently a `<form>`. An HTML `<form>` cannot nest inside another `<form>`, and Task 2 embeds the uploader inside `ProductForm`'s form. Rework it into a plain `<div>` control: a file input read via a ref, and an `onClick` Upload button.

**Files:**

- Modify: `components/dashboard/product-image-uploader.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/dashboard/product-image-uploader.tsx` with:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, uploadProductImage } from '@/lib/storage/upload-product-image';

// A non-form control so it can be embedded inside ProductForm's <form> without
// nesting forms. The file is read from a ref; the Upload button is
// type="button" and triggers the upload via onClick.
export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload() {
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Select an image to upload.');
      return;
    }
    startTransition(async () => {
      try {
        await uploadProductImage(productId, file);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="product-image">Add an image (JPEG, PNG, WebP, or AVIF; up to 10 MB)</Label>
        <Input
          id="product-image"
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          disabled={isPending}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleUpload} disabled={isPending} variant="outline">
        {isPending ? 'Uploading…' : 'Upload image'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: completes with no errors. If `format:check` flags the file, run `npm run format` and re-run. NOTE: `npm run check` covers the whole repo — a problem in a file you did NOT touch is pre-existing: report it, do not fix it.

- [ ] **Step 3: Manual verification — uploader still works**

With the dev server running, sign in as a seller (`maria@balikha.test` / `password123`), open a product's edit page, and upload an image — it should upload and appear in the list, exactly as before (it is now a `<div>` with an `onClick` button instead of a `<form>`).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/product-image-uploader.tsx
git commit -m "refactor(images): make ProductImageUploader a non-form control"
```

Use a NORMAL `git commit` (NOT `--amend`). Commit to `main`; no branch, no PR.

## Context for Task 1

- `ProductImageUploader` is used only by the product edit page today. After Task 2 it is used inside `ProductForm`. Either way, a non-form control works.
- The project's `Input` (`components/ui/input.tsx`) forwards `ref` to the underlying `<input>` (it spreads `...props`, and Base UI inputs forward refs), so `inputRef.current` is the `<input>` element — `.files` and `.value` are available.
- `uploadProductImage` (from `lib/storage/upload-product-image.ts`) throws on failure; the `catch` surfaces the message.
- The file input has no `name` — it is read via the ref, never via form submission.

---

### Task 2: Restructure `ProductForm` into two cards; thin both product pages

`ProductForm` becomes the single owner of the surface: one `<form>` with a "Product details" card, a "Photos" card, then the submit button. Edit mode renders the photo grid + uploader in the Photos card; create mode renders the buffer. Both product pages stop wrapping `ProductForm` in their own cards.

**Files:**

- Modify: `components/dashboard/product-image-list.tsx`
- Modify: `components/dashboard/product-form.tsx`
- Modify: `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx`
- Modify: `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`

- [ ] **Step 1: Export `ImageRow` from `product-image-list.tsx`**

In `components/dashboard/product-image-list.tsx`, the `ImageRow` type is declared as `type ImageRow = {`. Add the `export` keyword:

```ts
export type ImageRow = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};
```

Nothing else in that file changes.

- [ ] **Step 2: Replace `components/dashboard/product-form.tsx`**

Replace the ENTIRE contents of `components/dashboard/product-form.tsx` with:

```tsx
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>
            The first photo is the preview buyers see on public pages.
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
```

- [ ] **Step 3: Replace `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx`**

Replace the ENTIRE contents of that file with:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, productImages, products } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { ProductForm } from '@/components/dashboard/product-form';
import { ProductStatusButtons } from '@/components/dashboard/product-status-buttons';

export const metadata = {
  title: 'Edit product',
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalogSlug: string; productSlug: string }>;
  searchParams: Promise<{ imagesFailed?: string }>;
}) {
  const { catalogSlug, productSlug } = await params;
  const { imagesFailed } = await searchParams;
  // Ephemeral marker set by the create flow when a photo upload failed. Not
  // persisted — a bookmarked URL could re-show it, which is harmless.
  const failedCount = Number(imagesFailed);
  const showImagesFailedNotice = Number.isInteger(failedCount) && failedCount > 0;
  const profile = await requireSellerProfile();

  const [catalog] = await db
    .select({ id: catalogs.id, slug: catalogs.slug, title: catalogs.title })
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, catalogSlug)))
    .limit(1);
  if (!catalog) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.artisanProfileId, profile.id),
        eq(products.catalogId, catalog.id),
        eq(products.slug, productSlug),
      ),
    )
    .limit(1);
  if (!product) notFound();

  const images = await db
    .select({
      id: productImages.id,
      url: productImages.url,
      width: productImages.width,
      height: productImages.height,
      altText: productImages.altText,
    })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position));

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href={`/dashboard/catalogs/${catalog.slug}`} className="hover:underline">
            ← {catalog.title}
          </Link>
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">{product.title}</h1>
            <p className="text-muted-foreground text-sm">/{product.slug}</p>
          </div>
          <ProductStatusButtons productId={product.id} status={product.status} />
        </div>
      </header>

      {showImagesFailedNotice && (
        <p role="status" className="bg-secondary/50 rounded-md border p-3 text-sm">
          {failedCount === 1
            ? 'One photo could not be uploaded when this product was created. Add it below.'
            : `${failedCount} photos could not be uploaded when this product was created. Add them below.`}
        </p>
      )}

      <ProductForm
        // Remount when the product row changes — e.g. after a save's
        // router.refresh() — so the uncontrolled inputs re-initialise with
        // the new defaults instead of warning that defaultValue changed.
        key={product.updatedAt.getTime()}
        mode="edit"
        productId={product.id}
        images={images}
        defaults={{
          title: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          stockOnHand: product.stockOnHand,
          weightGrams: product.weightGrams,
          materials: product.materials,
          dimensions: product.dimensions,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`**

Read the file first. Two changes:

(a) Remove the now-unused card import line:

```ts
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
```

(b) Replace the `<Card>` block that wraps `ProductForm` — currently:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Product details</CardTitle>
    <CardDescription>Fill in the details and add photos below.</CardDescription>
  </CardHeader>
  <CardContent>
    <ProductForm mode="create" catalogId={catalog.id} catalogSlug={catalog.slug} />
  </CardContent>
</Card>
```

with just:

```tsx
<ProductForm mode="create" catalogId={catalog.id} catalogSlug={catalog.slug} />
```

Leave the rest of the file (the `?onboarding=1` header logic, the catalog query, the wrapping `<div>`) unchanged.

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: completes with no errors. If `format:check` flags a file you edited, run `npm run format` and re-run.

- [ ] **Step 6: Manual verification**

With the dev server running, as a seller:

1. **Create page** (`/dashboard/catalogs/shop/products/new`): a "Product details" card, then a "Photos" card (file picker + previews), then the "Create product" button last. Creating a product with photos still works and lands on the product page.
2. **Edit page** (open any product): a "Product details" card, then a "Photos" card (the existing-photo grid + the add-image control), then "Save changes" last. Uploading and removing an image still works; making a field edit then uploading a photo does not discard the unsaved field edit.
3. The two pages visibly share the same structure.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/product-image-list.tsx components/dashboard/product-form.tsx "app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx" "app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx"
git commit -m "feat(products): unify the create and edit product form layout"
```

Use a NORMAL `git commit` (NOT `--amend`). Commit to `main`; no branch, no PR.

## Context for Task 2

- This task must land atomically: `ProductForm`'s `EditMode` gains a required `images` prop, which would fail typecheck on the edit page until that page passes `images`. All four files change together.
- `ProductForm` now renders its own `<Card>`s, so the pages must NOT wrap it in a card.
- Edit mode: `ProductForm` renders `ProductImageList` (existing photos, instant remove) + the reworked `ProductImageUploader` (instant add). Both are non-form, so there is exactly one `<form>` on the page.
- `key={product.updatedAt.getTime()}` on the edit page: an image upload/remove does not change `products.updatedAt`, so it does not remount `ProductForm` — unsaved field edits survive. A details save does change `updatedAt` and remounts, which is intended.
- This project has NO test framework. Verification is `npm run check` + the manual walk-through.

---

## Final verification

- [ ] **Run the full check suite**

Run: `npm run check`
Expected: typecheck, lint, and format:check all pass.

- [ ] **Side-by-side structure check**

Open the create page and an edit page. Both must show: Product details card → Photos card → submit button last. Confirm there is no nested-form breakage (the edit page's image controls work).
