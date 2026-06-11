// Shared searchParams parsing for the admin list pages. Every value
// arrives as `string | string[] | undefined` from Next; these collapse
// the array form and clamp to safe values.

export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function parseSearchParam(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

export function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}
