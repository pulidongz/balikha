// Central builders for public studio URLs. Every link, OG tag, sitemap
// entry, and revalidatePath() that targets a studio page must go through
// these so a future route rename is a two-line change here plus a
// redirect rule in next.config.ts (T1 renamed /shop/* → /studio/*).

// Slugs are URL-safe in practice, but no schema CHECK enforces that — encode
// each segment so a malformed slug can never break out of the path. For valid
// (lowercase-alphanumeric-hyphen) slugs this is a no-op, so revalidatePath()
// callers are unaffected.
export function studioPath(artisanSlug: string): string {
  return `/studio/${encodeURIComponent(artisanSlug)}`;
}

export function workPath(artisanSlug: string, productSlug: string): string {
  return `/studio/${encodeURIComponent(artisanSlug)}/${encodeURIComponent(productSlug)}`;
}
