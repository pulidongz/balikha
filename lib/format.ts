// Drizzle returns numeric columns as strings to preserve precision.
// parseFloat is acceptable here ONLY because the result feeds Intl
// formatting for display — never use it for arithmetic. For math, use
// decimal.js or convert to integer cents at the boundary.
export function formatPrice(value: string, currency: string, locale = 'en-PH'): string {
  const num = Number.parseFloat(value);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
}

// Compact relative-time formatter using the platform Intl.RelativeTimeFormat.
// Avoids pulling in date-fns just for one timeline string. "now" if under 60s.
export function formatRelativeTime(date: Date, locale = 'en-PH'): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';

  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = Math.round(sec / 60);
  if (min < 60) return fmt.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return fmt.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (day < 30) return fmt.format(-day, 'day');
  const month = Math.round(day / 30);
  if (month < 12) return fmt.format(-month, 'month');
  const year = Math.round(month / 12);
  return fmt.format(-year, 'year');
}
