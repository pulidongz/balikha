# Product Image Upload During Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller attach photos on the product create form; the photos upload to the product right after it is created, and the seller lands on the product page.

**Architecture:** The image-upload flow is bound to a `productId`, so photos can't upload before the product exists. The create form buffers chosen photos in client state; on submit it creates the product, then uploads the buffered photos to the new product id, then redirects. The per-file upload dance is extracted into one shared client helper used by both the create form and the existing product-page uploader.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, S3-compatible storage (MinIO/R2) via presigned URLs.

**Testing note:** This project has **no test framework** (`npm run check` is typecheck + lint + format only). Verification is `npm run check` passing clean plus the manual walk-through in each task. Do **not** add a test framework.

**Branch/commit policy:** Commit directly to the current branch (`main`) after each task — normal `git commit`, not `--amend`. No feature branch, no PR.

**Prerequisite:** Commit the pending uncommitted fix batch (catalog Zod fix, Base UI fixes, price formatting, create→product redirect) **before** starting — this plan's code anchors assume the current working-tree state of `product-form.tsx`, `lib/actions/product.ts`, and `lib/validators/product.ts`, and committing first keeps history clean.

**Reference spec:** `docs/superpowers/specs/2026-05-18-product-image-upload-on-create-design.md`

---

### Task 1: Extract the shared image-upload helper

Pull the per-file upload logic out of `ProductImageUploader` into one reusable
client module, so the create form and the product-page uploader share it.

**Files:**

- Create: `lib/storage/upload-product-image.ts`

- [ ] **Step 1: Create the helper module**

Create `lib/storage/upload-product-image.ts` with exactly this content:

```ts
// Client-side orchestration for uploading one product image: validate, request
// a presigned URL, PUT the file to storage, read its pixel dimensions, then
// confirm. Used by the create form (ProductForm) and the product-page uploader
// (ProductImageUploader). Browser-only — uses fetch, Image, and URL.

import { confirmImageUploadAction, requestImageUploadAction } from '@/lib/actions/product-image';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Returns a human-readable problem, or null if the file passes the preflight.
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, WebP, or AVIF images are allowed.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 10 MB or smaller.';
  }
  return null;
}

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = objectUrl;
  });
}

// Uploads one image to one product. Throws an Error on any failure.
export async function uploadProductImage(productId: string, file: File): Promise<void> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const presigned = await requestImageUploadAction({
    productId,
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!presigned.ok) throw new Error(presigned.error);

  const putResponse = await fetch(presigned.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putResponse.ok) throw new Error(`Upload to storage failed (${putResponse.status})`);

  const dims = await readDimensions(file);

  const confirmed = await confirmImageUploadAction({
    productId,
    key: presigned.data.key,
    width: dims.width,
    height: dims.height,
  });
  if (!confirmed.ok) throw new Error(confirmed.error);
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: completes with no errors. The module is not imported anywhere yet — that is fine; Task 2 wires it in.

- [ ] **Step 3: Commit**

```bash
git add lib/storage/upload-product-image.ts
git commit -m "feat(images): extract a shared product-image upload helper"
```

---

### Task 2: Route the product-page uploader through the shared helper

Replace `ProductImageUploader`'s inline copy of the upload logic with the
Task 1 helper. No behavior change — DRY cleanup, and a regression checkpoint.

**Files:**

- Modify: `components/dashboard/product-image-uploader.tsx`

- [ ] **Step 1: Replace the file with the helper-based version**

Replace the entire contents of `components/dashboard/product-image-uploader.tsx`:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, uploadProductImage } from '@/lib/storage/upload-product-image';

export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      action={(formData) => {
        setError(null);
        const file = formData.get('image');
        if (!(file instanceof File) || file.size === 0) {
          setError('Select an image to upload.');
          return;
        }
        startTransition(async () => {
          try {
            await uploadProductImage(productId, file);
            formRef.current?.reset();
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.');
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="product-image">Add an image (JPEG, PNG, WebP, or AVIF; up to 10 MB)</Label>
        <Input
          id="product-image"
          name="image"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          required
          disabled={isPending}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Uploading…' : 'Upload image'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 3: Manual verification — uploader still works**

With the dev server running, sign in as a seller (`maria@balikha.test` /
`password123`), open any product's edit page, and upload an image in the
Images card — it should upload and appear in the list as before.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/product-image-uploader.tsx
git commit -m "refactor(images): use the shared upload helper in ProductImageUploader"
```

---

### Task 3: `createProductAction` returns the new product id

The create form needs the new product's id to upload buffered photos to it.

**Files:**

- Modify: `lib/actions/product.ts`

- [ ] **Step 1: Widen the return type**

In `lib/actions/product.ts`, change the `createProductAction` signature
(currently lines 70-73):

```ts
export async function createProductAction(
  catalogId: string,
  formData: FormData,
): Promise<Result<{ slug: string; productId: string }>> {
```

- [ ] **Step 2: Capture and return the inserted id**

In the same function, replace the insert + revalidate + return block (currently
lines 108-125 — the `await db.insert(products)...` call through `return ok({ slug })`):

```ts
const [created] = await db
  .insert(products)
  .values({
    catalogId,
    artisanProfileId: profile.id,
    slug,
    title,
    description: description ?? null,
    price,
    currency,
    stockOnHand,
    status: 'draft',
    dimensions: dimensions ?? null,
    materials: materials ?? null,
    weightGrams: weightGrams ?? null,
  })
  .returning({ id: products.id });
if (!created) return err('Failed to create product.');

revalidatePath('/dashboard/catalogs');
revalidateTag(FACET_TAG, 'max');
return ok({ slug, productId: created.id });
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: completes with no errors. `ProductForm`'s create branch reads
`result.data.slug`; the added `productId` field does not break it.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/product.ts
git commit -m "feat(products): return the new product id from createProductAction"
```

---

### Task 4: Photo buffer on the create form

Add a Photos picker to the create form, buffer the files, and upload them to
the new product right after it is created.

**Files:**

- Modify: `components/dashboard/product-form.tsx`
- Modify: `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`

- [ ] **Step 1: Update imports in `product-form.tsx`**

Change the React import (currently line 3) and add the `next/image` and helper
imports. The top import block becomes:

```tsx
'use client';

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createProductAction, updateProductAction } from '@/lib/actions/product';
import {
  ACCEPTED_IMAGE_TYPES,
  uploadProductImage,
  validateImageFile,
} from '@/lib/storage/upload-product-image';
```

- [ ] **Step 2: Add the photo-buffer state and handlers**

In `product-form.tsx`, immediately after the line
`const [price, setPrice] = useState(() => formatPriceForDisplay(d?.price ?? ''));`
insert:

```tsx
// --- Create-mode photo buffer -------------------------------------------
// Photos are buffered client-side and uploaded after the product is created
// (the upload flow needs a productId). Edit mode uses the product page's
// Images card, so this state is only exercised when mode === 'create'.
const [images, setImages] = useState<{ file: File; url: string }[]>([]);
const [imageError, setImageError] = useState<string | null>(null);
const [imageUploadProgress, setImageUploadProgress] = useState<{
  done: number;
  total: number;
} | null>(null);

// Mirror the buffer into a ref so the unmount cleanup can revoke every
// object URL without the effect re-running on each buffer change.
const imagesRef = useRef<{ file: File; url: string }[]>([]);
imagesRef.current = images;
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
```

- [ ] **Step 3: Upload the buffer after create**

In the `action` callback's `startTransition`, replace the `else` (create)
branch — currently:

```tsx
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
```

with:

```tsx
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
            }
            setImageUploadProgress(null);
            const dest = `/dashboard/catalogs/${props.catalogSlug}/products/${slug}`;
            router.push(failed > 0 ? `${dest}?imagesFailed=${failed}` : dest);
          }
```

- [ ] **Step 4: Add the Photos section to the form**

In `product-form.tsx`, find the end of the "Weight (grams, optional)" field —
the block that ends:

```tsx
        {fieldError('weightGrams') && (
          <p className="text-destructive text-xs">{fieldError('weightGrams')}</p>
        )}
      </div>

      {error && (
```

Replace it with (Photos section inserted before the `{error && (` block):

```tsx
        {fieldError('weightGrams') && (
          <p className="text-destructive text-xs">{fieldError('weightGrams')}</p>
        )}
      </div>

      {props.mode === 'create' && (
        <div className="space-y-2">
          <Label htmlFor="product-photos">Photos</Label>
          <Input
            id="product-photos"
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={handleFilesPicked}
            disabled={isPending}
          />
          <p className="text-muted-foreground text-xs">
            JPEG, PNG, WebP, or AVIF; up to 10 MB each. The first photo is the preview buyers
            see.
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
      )}

      {error && (
```

- [ ] **Step 5: Reflect upload progress on the submit button**

In `product-form.tsx`, replace the submit button — currently:

```tsx
<Button type="submit" size="lg" disabled={isPending}>
  {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
</Button>
```

with:

```tsx
<Button type="submit" size="lg" disabled={isPending}>
  {imageUploadProgress
    ? `Uploading photos ${imageUploadProgress.done}/${imageUploadProgress.total}…`
    : isPending
      ? 'Saving…'
      : isEdit
        ? 'Save changes'
        : 'Create product'}
</Button>
```

- [ ] **Step 6: Update the create page's stale description**

In `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`,
the Product details card description currently says images come later. Replace:

```tsx
<CardDescription>Add images on the product page after it&apos;s created.</CardDescription>
```

with:

```tsx
<CardDescription>Fill in the details and add photos below.</CardDescription>
```

- [ ] **Step 7: Verify**

Run: `npm run check`
Expected: completes with no errors. If `format:check` flags a file you edited,
run `npm run format` and re-run.

- [ ] **Step 8: Manual verification — create with photos**

With the dev server running, as a seller, go to a catalog and create a new
product: fill the fields, pick 2–3 photos (thumbnails should preview, each
removable), and click "Create product". Confirm you land on the new product's
page and the photos are present in the Images card, in the order picked.
Create another product with no photos — it should still land on the product
page cleanly.

- [ ] **Step 9: Commit**

```bash
git add components/dashboard/product-form.tsx "app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx"
git commit -m "feat(products): attach photos on the product create form"
```

---

### Task 5: Partial-failure notice on the product page

When one or more photos fail to upload during creation, the create flow
redirects with `?imagesFailed=<n>`. Show a calm notice on the product page.

**Files:**

- Modify: `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx`

- [ ] **Step 1: Accept `searchParams` and derive the notice flag**

Replace the function signature and the `await params` line (currently lines
17-22) with:

```tsx
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
```

- [ ] **Step 2: Render the notice above the Images card**

In the same file, find the Images card — the block that starts:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
```

Insert this notice immediately before that `<Card>`:

```tsx
      {showImagesFailedNotice && (
        <p role="status" className="rounded-md border bg-secondary/50 p-3 text-sm">
          {failedCount === 1
            ? 'One photo could not be uploaded when this product was created. Add it below.'
            : `${failedCount} photos could not be uploaded when this product was created. Add them below.`}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 4: Manual verification — the notice**

As a seller, visit a product page with `?imagesFailed=2` appended to the URL —
a calm notice should appear above the Images card. Visit the same page without
the param — no notice.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx"
git commit -m "feat(products): show a notice when create-time photo uploads fail"
```

---

## Final verification

- [ ] **Run the full check suite**

Run: `npm run check`
Expected: typecheck, lint, and format:check all pass with no errors.

- [ ] **End-to-end walk-through**

1. Create a product with 2–3 photos → land on the product page, photos present in pick order.
2. Create a product with no photos → land on the product page, no notice.
3. On an existing product's edit page, upload an image via the Images card → still works (Task 2 regression).
4. Visit a product page with `?imagesFailed=1` → the calm notice shows.

**Note:** the partial-failure path (a real upload failure mid-batch) is type-checked
but not in the manual matrix — triggering it requires breaking storage. Accepted.
