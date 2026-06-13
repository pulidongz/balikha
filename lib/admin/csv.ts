// Minimal RFC-4180 CSV serialisation for admin exports. Quotes any field
// containing a comma, quote, or newline and doubles embedded quotes. No
// dependency — the shape we export (flat string/number rows) needs nothing more.

export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection: a field starting with =,+,-,@
  // (or a leading tab/CR) is treated as a formula by Excel/Sheets. The export
  // is admin-only but its CONTENT is user-controlled (names, emails, titles),
  // and the victim is the admin opening the file — prefix a single quote so the
  // value renders literally.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
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
