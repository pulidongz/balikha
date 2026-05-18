# Unified Product Form Layout — Design

**Date:** 2026-05-18
**Status:** Approved for planning

## Problem

The product create and edit pages handle images in visibly different ways:

- **Create** (`products/new`): one "Product details" card; the photo picker
  sits inline after the Weight field; then the "Create product" button.
- **Edit** (`products/[productSlug]`): a separate "Images" card _above_ a
  "Product details" card that ends with "Save changes".

The two pages should look the same. The desired order, on both, is:
**Product details → Images → submit button (last).**

The structural reason they differ: the edit-page uploader (`ProductImageUploader`)
is its own `<form>`, and create-page images are a client-side buffer. An HTML
`<form>` cannot nest inside another `<form>`, which is why the edit-page image
section currently lives in its own card outside the details form.

## Decision (locked)

`ProductForm` becomes the single owner of the whole product surface. It renders
one `<form>` containing a **Product details** card, an **Images** card, then the
submit button — identical structure for create and edit. The Images card's
_content_ differs by mode (create has no product id yet), but the layout is the
same.

To allow the image section to sit inside `ProductForm`'s `<form>`,
`ProductImageUploader` is reworked from a `<form>` into a plain non-form control.

## Goal

Both pages render the same vertical structure — Product details card, Images
card, submit button last — via one `ProductForm` component. The submit button is
always the last element on the page.

## Non-goals

- No change to the upload pipeline (`lib/storage/upload-product-image.ts`,
  `requestImageUploadAction`, `confirmImageUploadAction`), the create-mode photo
  buffer logic, or `createProductAction` / `updateProductAction`.
- No change to `ProductImageList`'s behavior (instant per-image remove).
- No schema change.
- No extraction of `ProductForm` into sub-components (it grows modestly; that is
  acceptable for one cohesive component — see Notes).

## Target layout

Both pages, top to bottom:

```
[ page header — breadcrumb / onboarding intro / status buttons / notices ]
ProductForm:
  ┌─ Card: Product details ─────────────┐
  │  Title · Description                │
  │  Price · Currency · Stock           │
  │  Materials · Dimensions · Weight    │
  └─────────────────────────────────────┘
  ┌─ Card: Images ──────────────────────┐
  │  create: file picker + previews     │
  │  edit:   photo grid + add control   │
  └─────────────────────────────────────┘
  [ Create product / Save changes ]   ← last
```

## Detailed design

### 1. `components/dashboard/product-image-uploader.tsx` — rework to non-form

Currently a `<form action={…}>`. Rework into a plain control so it can be
embedded inside `ProductForm`'s `<form>` without nesting:

- Render a `<div>` (not a `<form>`).
- A `<Input type="file">` accessed via a `ref` (no `name` — it is not part of
  any form submission).
- An "Upload image" `<Button type="button" onClick={…}>` — `type="button"` so
  it never submits an ancestor form.
- The click handler: read `inputRef.current?.files?.[0]`; if absent, show
  "Select an image to upload."; otherwise `startTransition` →
  `uploadProductImage(productId, file)` → on success clear the input value and
  `router.refresh()`, on failure `setError`.

Behavior is unchanged from the user's view — pick a file, click Upload, the
image appears. It is only no longer a `<form>` element.

### 2. `components/dashboard/product-form.tsx` — own the cards and the image section

`ProductForm` currently renders a bare `<form>` (fields + create-mode photo
buffer + button); the pages wrap it in a `<Card>`. Change it so `ProductForm`
renders the cards itself:

- The `<form>` contains, in order: a **Product details** `<Card>` (all the
  detail fields — Title through Weight), an **Images** `<Card>`, then the submit
  `<Button>`.
- **Images card — create mode:** the existing photo-buffer UI (multi-file
  picker, previews, remove) moves into this card's body. The buffer state and
  upload-on-submit orchestration are unchanged.
- **Images card — edit mode:** renders `<ProductImageList images={images} />`
  followed by the reworked `<ProductImageUploader productId={productId} />`.
- `EditMode` props gain `images` — the existing-photo rows. Type:
  `{ id: string; url: string; width: number | null; height: number | null; altText: string | null }[]`.
  `product-image-list.tsx` exports its `ImageRow` type; `ProductForm` imports it
  and uses it for the `images` prop so the two stay in sync.
- The Images `<CardDescription>` is the same for both modes:
  "The first photo is the preview buyers see on public pages."
- The submit button is the last child of the `<form>`, after both cards
  (unchanged button logic — label still reflects `imageUploadProgress` /
  `isPending` / mode).

### 3. `app/(dashboard)/.../products/new/page.tsx`

Drop the page's `<Card>` wrapper around `ProductForm` — `ProductForm` now
renders its own cards. The page becomes: the existing header (the `?onboarding=1`
intro or the normal breadcrumb header), then `<ProductForm mode="create" … />`.

### 4. `app/(dashboard)/.../products/[productSlug]/page.tsx`

- Drop the standalone "Images" `<Card>` (its `ProductImageList` +
  `ProductImageUploader`) and the `<Card>` wrapper around `ProductForm`.
- Pass the already-fetched `images` array into `<ProductForm mode="edit" … />`.
- Keep the page header (breadcrumb, product title, `ProductStatusButtons`) and
  the `?imagesFailed` notice, both above `<ProductForm>`. The notice's "add them
  below" copy stays accurate — the Images card is the second card inside
  `ProductForm`, below the notice.
- Keep `key={product.updatedAt.getTime()}` on `<ProductForm>`.

The edit page no longer imports `ProductImageList` / `ProductImageUploader`
directly — `ProductForm` does.

## Interactions / edge cases

- **`key` remount (edit):** `ProductForm` remounts only when
  `product.updatedAt` changes — i.e. on a details save. An image upload/remove
  changes `product_images`, not `products.updatedAt`, so it does **not** remount
  `ProductForm`; `router.refresh()` re-renders the page, the new `images` prop
  flows to `ProductImageList`, and the seller's unsaved field edits survive.
- **Nested forms:** after the rework there is exactly one `<form>` on each page
  (`ProductForm`'s). `ProductImageUploader` is a `<div>`; `ProductImageList` is a
  `<ul>` + dialog. No nesting.
- **Edit-mode image input has no `name`** — it is read via ref, so it never
  appears in `ProductForm`'s `updateProductAction` FormData.

## Out of scope

- The create-mode buffer behavior, partial-failure `?imagesFailed` flow, and the
  price/redirect behavior — all unchanged.
- Visual restyling beyond the card restructure.

## Notes

`product-form.tsx` grows modestly (the two card wrappers + the edit-mode image
branch). It remains one cohesive component — the create buffer state is coupled
to the submit orchestration, so extracting it would require lifting state for
no real gain. Accepted.

## Testing

No test framework; verification is `npm run check` plus a manual walk-through:

- Create page: Product details card → Images card (pick photos) → "Create
  product" button last. Creating with photos still works end-to-end.
- Edit page: Product details card → Images card (existing grid + add) → "Save
  changes" button last. Uploading and removing an image still works; unsaved
  field edits survive an image upload.
- Both pages visibly share the same structure.
