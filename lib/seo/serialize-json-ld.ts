// Pure, testable serializer for embedding JSON-LD in an inline <script> tag.
//
// JSON.stringify escapes quotes and backslashes but NOT `<`, `>`, or `&`, so a
// stored value containing `</script>` would break out of the JSON-LD block and
// let the rest parse as HTML (stored XSS). Escaping those characters — plus the
// two line/paragraph separators (U+2028/U+2029) that are legal in JSON strings
// but illegal in raw JS — as \uXXXX keeps the output valid JSON-LD (search
// engines read it identically) while making a `</script>` breakout impossible.
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}
