// Central builders for public studio URLs. Every link, OG tag, sitemap
// entry, and revalidatePath() that targets a studio page must go through
// these so a future route rename is a two-line change here plus a
// redirect rule in next.config.ts (T1 renamed /shop/* → /studio/*).

export function studioPath(artisanSlug: string): string {
  return `/studio/${artisanSlug}`;
}

export function workPath(artisanSlug: string, productSlug: string): string {
  return `/studio/${artisanSlug}/${productSlug}`;
}
