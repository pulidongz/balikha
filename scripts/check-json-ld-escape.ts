/**
 * Regression guard for the JSON-LD XSS fix (security audit finding H1).
 * `serializeJsonLd` must neutralise `</script>` breakout and the U+2028/U+2029
 * line separators while still producing JSON that round-trips to the original
 * data. Self-contained: no DB / network / secrets. Run: npm run test:json-ld
 */
import { serializeJsonLd } from '../lib/seo/serialize-json-ld';
import { assert, section, finish } from './lib/check-harness';

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

section('serializeJsonLd — breakout prevention');
const payload = { name: '</script><script>alert(document.cookie)</script>' };
const out = serializeJsonLd(payload);
assert(!out.includes('</script>'), 'no raw </script> survives serialization');
assert(!out.includes('<'), 'no raw < survives');
assert(!out.includes('>'), 'no raw > survives');
assert(out.includes('\\u003c') && out.includes('\\u003e'), '< and > are \\uXXXX-escaped');

section('serializeJsonLd — ampersand and separators');
assert(serializeJsonLd({ a: 'x&y' }).includes('\\u0026'), '& is escaped to \\u0026');
assert(!serializeJsonLd({ a: 'x&y' }).includes('&'), 'no raw & survives');
assert(
  serializeJsonLd({ a: `line${LINE_SEP}break` }).includes('\\u2028'),
  'U+2028 line separator is escaped',
);
assert(
  serializeJsonLd({ a: `para${PARA_SEP}break` }).includes('\\u2029'),
  'U+2029 paragraph separator is escaped',
);

section('serializeJsonLd — data integrity (round-trips to original)');
// The browser reads the escaped output as JSON; JSON.parse must recover the
// exact original object, proving the escaping does not corrupt content.
const data = {
  '@type': 'Product',
  name: 'Vase </script> & "quotes"',
  description: `multi${LINE_SEP}line & <b>markup</b>`,
  price: 1200,
};
assert(
  JSON.stringify(JSON.parse(serializeJsonLd(data))) === JSON.stringify(data),
  'escaped output JSON.parses back to the original data',
);

section('serializeJsonLd — benign content is unchanged vs JSON.stringify');
const benign = { name: 'Maria Ceramics', location: 'Quezon City' };
assert(
  serializeJsonLd(benign) === JSON.stringify(benign),
  'content with no HTML-significant chars is byte-identical to JSON.stringify',
);

finish('All JSON-LD escaping checks passed');
