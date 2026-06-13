// Unit checks for the admin CSV serializer (lib/admin/csv.ts). Security-relevant
// (formula-injection guard) + RFC-4180 edge cases, so it gets explicit coverage.
// DB-free. Run: npm run test:csv
import { csvField, toCsv } from '@/lib/admin/csv';

let failures = 0;

function eq(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    process.stdout.write(`✓ ${name}\n`);
  } else {
    failures += 1;
    console.error(`✗ ${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  }
}

// Plain values pass through untouched.
eq('plain', csvField('hello'), 'hello');
eq('number', csvField(42), '42');
eq('null → empty', csvField(null), '');
eq('undefined → empty', csvField(undefined), '');

// RFC-4180 quoting.
eq('comma quoted', csvField('a,b'), '"a,b"');
eq('embedded quote doubled', csvField('a"b'), '"a""b"');
eq('newline quoted', csvField('a\nb'), '"a\nb"');

// Formula-injection guard — leading =,+,-,@ get a single-quote prefix.
eq('equals prefixed', csvField('=1+1'), "'=1+1");
eq('plus prefixed', csvField('+1'), "'+1");
eq('at prefixed', csvField('@SUM(A1)'), "'@SUM(A1)");
eq(
  'hyperlink formula prefixed + quoted',
  csvField('=HYPERLINK("http://x","y")'),
  '"\'=HYPERLINK(""http://x"",""y"")"',
);

// toCsv assembles header + rows with CRLF.
eq('toCsv shape', toCsv(['A', 'B'], [['1', 'x,y']]), 'A,B\r\n1,"x,y"');

if (failures > 0) {
  console.error(`\n${failures} CSV check(s) failed`);
  process.exit(1);
}
process.stdout.write('\n✓ all CSV checks passed\n');
