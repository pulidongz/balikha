// Minimal RFC-4180 CSV serialisation for admin exports. Quotes any field
// containing a comma, quote, or newline and doubles embedded quotes. No
// dependency — the shape we export (flat string/number rows) needs nothing more.

export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  // CRLF line endings per RFC 4180 — Excel-friendly.
  return lines.join('\r\n');
}
