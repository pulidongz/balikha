# Product Image Upload During Creation — Design

**Date:** 2026-05-18
**Status:** Approved for planning

## Problem

A seller creating a product has no way to attach photos on the create form
(`/dashboard/catalogs/[catalogSlug]/products/new`). Images can only be added
afterward, on the product's edit page. This is because the upload flow is
bound to a `productId`: `requestImageUploadAction` checks the product exists
and is owned, and the storage key is `products/<productId>/<uuid>.<ext>` —
re-validated as an anti-tampering prefix check on confirm. An image genuinely
cannot be stored before its product row exists.

## Decision (locked)

**Approach B — attach images on the create form.** The create form buffers
selected photos in client state; on "Create product" the product is created
first, then the buffered photos upload to it, then the seller lands on the
product page. The product is still created cleanly; images ride along with the
Create action. No schema change, no change to the presigned upload flow.

(Rejected: creating a blank draft product immediately — needs the `products`
table to tolerate near-blank rows, accumulates abandoned drafts, and risks a
0-price draft being published. Also rejected: a temp-storage staging area —
needs orphan cleanup and key rewriting for little gain.)

## Goal

On the create form the seller picks product photos, sees removable thumbnail
previews, and on a single "Create product" click the product is created and
its photos uploaded — landing on the product page.

## Non-goals

- No change to the `products` / `product_images` schema, the presigned upload
  flow, or `confirmImageUploadAction`.
- `productCreateSchema` is unchanged — images are `File` state, not form fields.
- No per-product image-count limit (YAGNI).
- Edit mode is untouched — the product edit page already has its Images card.

## The flow

```
Create form: pick photos  →  buffered as File[], thumbnail previews, removable
                              (each file preflighted at pick time)
Click "Create product":
  1. createProductAction → creates the draft product, returns { slug, productId }
  2. for each buffered file, in order: uploadProductImage(productId, file)
  3. redirect to /dashboard/catalogs/<catalogSlug>/products/<slug>
     (with ?imagesFailed=<n> if any upload failed)
```

Sequential upload in buffer order keeps `product_images.position` aligned with
the order the seller arranged — position 0 is the social-share preview.

## Detailed design

### 1. New: `lib/storage/upload-product-image.ts`

A **client-side** module (uses browser `fetch`, `Image`, `URL`) that extracts
the per-file upload logic currently inlined in `product-image-uploader.tsx`.
Imported only by client components.

Exports:

- `ACCEPTED_IMAGE_TYPES: readonly string[]` — `['image/jpeg', 'image/png', 'image/webp', 'image/avif']` (moved from `product-image-uploader.tsx`).
- `MAX_IMAGE_BYTES: number` — `10 * 1024 * 1024` (moved).
- `validateImageFile(file: File): string | null` — returns a human-readable
  error message, or `null` if the file passes the type/size preflight.
- `uploadProductImage(productId: string, file: File): Promise<void>` — runs the
  full dance: preflight (`validateImageFile`, throws on failure) →
  `requestImageUploadAction` → `PUT` to the presigned URL → read pixel
  dimensions → `confirmImageUploadAction`. Throws an `Error` on any failure.

The dimension-reading helper stays private to the module.

### 2. `components/dashboard/product-image-uploader.tsx`

Use the extracted module: `validateImageFile` for its preflight,
`uploadProductImage` for the upload, `ACCEPTED_IMAGE_TYPES` for the `accept`
attribute. Remove the now-duplicated inline constants and `uploadFile`/
`readDimensions`. No behavior change — this is DRY cleanup so the create form
and the edit-page uploader share one implementation.

### 3. `lib/actions/product.ts` — `createProductAction`

Return the new product's id alongside its slug. Change the insert to
`.returning({ id: products.id })`, guard the result, and return
`Result<{ slug: string; productId: string }>`. The buffered-image upload needs
`productId`. Only `ProductForm` consumes this return value.

### 4. `components/dashboard/product-form.tsx` — create mode only

**Photos section** (rendered only when `props.mode === 'create'`):

- State: `images: File[]` (the buffer).
- A `<input type="file" multiple accept={ACCEPTED_IMAGE_TYPES.join(',')}>`.
  On change: run `validateImageFile` on each picked file; append valid ones to
  the buffer, show a message listing any rejected ones. Reset `input.value`
  afterward so the same file can be re-picked.
- A thumbnail preview grid: one cell per buffered file, each with a remove (×)
  control. Previews use `URL.createObjectURL`; object URLs are revoked on
  remove and on unmount.
- Placement: a labeled "Photos" block after the existing fields, before the
  submit button.

**Submit orchestration** (create branch of the `startTransition` callback):

1. `createProductAction(props.catalogId, formData)`. On `!ok` → show error,
   return — nothing created, nothing uploaded.
2. Upload the buffer: for each `file` of `images`, sequentially,
   `await uploadProductImage(productId, file)`; count failures (catch per file
   so one failure does not abort the rest).
3. Redirect: `router.push` to
   `/dashboard/catalogs/<catalogSlug>/products/<slug>`, appending
   `?imagesFailed=<n>` when `n > 0`.

**Upload progress:** a state value `imageUploadProgress: { done: number; total: number } | null`,
set during the loop. The submit button label reflects it — e.g.
`Uploading photos 2/5…` — so a multi-image create is not a silent long wait.
When `total` is 0 the label stays the normal `Saving…`.

### 5. `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/[productSlug]/page.tsx`

Accept `searchParams` (the edit page currently does not). When
`imagesFailed` is a positive integer, render a calm notice immediately above
the Images card: _"Some photos didn't upload when this product was created.
Add them below."_ The marker is ephemeral — a query param, not persisted; a
bookmarked URL could re-show it, which is an accepted, harmless edge (same
property as the `?onboarding=1` marker).

## Error handling

| Situation                                   | Behavior                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File fails type/size preflight at pick time | Rejected before entering the buffer; message shown. Not uploaded.                                                                                                                                                                 |
| `createProductAction` fails                 | Error shown on the form; nothing created, no uploads.                                                                                                                                                                             |
| Product created, ≥1 photo upload fails      | Product persists as a draft (not public). Redirect to the product page with `?imagesFailed=<n>`; the page shows the notice; the seller re-adds via the Images card. Per-file `catch` means one failure does not block the others. |
| All photos succeed                          | Redirect to the product page, no marker.                                                                                                                                                                                          |
| Browser closed mid-upload                   | Product exists as a draft with whatever images committed; fully recoverable on the product page. No corruption.                                                                                                                   |

The redirect-with-notice was chosen over a retry-state-machine on the create
form: simpler, and the product page is already the place to manage images.

## Edge cases

- Empty buffer → step 2 is a no-op; plain redirect.
- The same file picked twice → appears twice in the buffer and previews; the
  seller can remove a duplicate. No dedup logic (YAGNI).
- The Photos section and buffer exist only in create mode; edit-mode
  `ProductForm` is unchanged.

## Sequencing

This touches `ProductForm` and `createProductAction` — the same files as the
current uncommitted fix batch (price formatting, create→product redirect).
Commit that batch before implementing this, so the work builds on a clean base.

## Testing

This project has no test framework; verification is `npm run check` plus a
manual walk-through:

- Create a product with 2–3 photos → lands on the product page with the photos
  present, in pick order.
- Create a product with no photos → lands on the product page, no notice.
- Regression: the product edit page's existing image uploader still works
  (it now routes through the shared `uploadProductImage` helper).
- The `?imagesFailed` notice and the partial-failure path are type-checked but
  not in the manual matrix — triggering a real upload failure requires breaking
  storage; accepted.
