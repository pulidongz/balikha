import { customAlphabet } from 'nanoid';

// 4-char alphanumeric suffix, lowercase only. The alphabet excludes 0/1/l/o
// — characters that look alike and confuse anyone reading a slug aloud or
// jotting it down. Entropy: 32^4 ≈ 1M combinations per base slug, plenty
// to avoid collisions for any plausible per-artisan or per-marketplace pool.
const suffixGenerator = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 4);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique slug for `title` within a uniqueness scope.
 *
 * `exists` is a callback that returns true if a candidate slug is already
 * taken in the relevant scope. Callers close over the scope (per-artisan
 * for products/catalogs, global for shop slugs).
 *
 * Strategy:
 *   1. Try the plain slugified title first — fast path, pretty URL.
 *   2. On collision, append a 4-char nanoid suffix. Retry up to 3 times
 *      (combined collision probability of three 1-in-1M draws is negligible).
 *   3. Throw if all three retries collide — the scope's slug pool is
 *      genuinely exhausted, which is an operations issue worth surfacing.
 */
export async function uniqueSlug(
  title: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(title);
  if (!base) {
    throw new Error(`Cannot generate slug from "${title}" — produced empty string after slugify`);
  }
  if (!(await exists(base))) return base;

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = `${base}-${suffixGenerator()}`;
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error(`Could not generate unique slug for "${title}" after 3 suffix retries`);
}
