// Drizzle returns numeric columns as strings to preserve precision.
// parseFloat is acceptable here ONLY because the result feeds Intl
// formatting for display — never use it for arithmetic. For math, use
// decimal.js or convert to integer cents at the boundary.
export function formatPrice(value: string, currency: string, locale = 'en-PH'): string {
  const num = Number.parseFloat(value);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
}
