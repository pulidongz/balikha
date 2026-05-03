import { searchRequestSchema, type SearchRequestInput } from '@/lib/validators/search';

/**
 * Parse Next.js searchParams into a validated SearchRequestInput, or null
 * on malformed input (caller should treat null as "show empty state").
 *
 * URL conventions:
 * - `materials=ceramic,porcelain` (comma-separated) — easier to read and
 *   edit by hand than repeated `?materials=…&materials=…` keys, and the
 *   total URL is shorter for typical filter counts.
 * - `inStockOnly=1` — any truthy string coerces to true via Zod.
 * - Numbers (`priceMin`, `priceMax`, `limit`) are coerced from strings.
 *
 * Next.js's searchParams shape allows string | string[] | undefined per
 * key (a key repeated in the URL becomes an array). We accept both array
 * and comma-separated forms for materials so callers don't have to canon-
 * icalize before parsing.
 */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): SearchRequestInput | null {
  const materialsRaw = raw.materials;
  const materials = Array.isArray(materialsRaw)
    ? materialsRaw
    : typeof materialsRaw === 'string'
      ? materialsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const parsed = searchRequestSchema.safeParse({
    q: raw.q,
    materials,
    priceMin: raw.priceMin,
    priceMax: raw.priceMax,
    inStockOnly: raw.inStockOnly,
    cursor: raw.cursor,
    limit: raw.limit,
  });

  return parsed.success ? parsed.data : null;
}
