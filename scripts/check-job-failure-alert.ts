import {
  buildJobFailureEmail,
  escapeHtml,
  stripControlChars,
} from '../lib/email/job-failure-alert';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const longLine = 'x'.repeat(500);
const sample = `line with <tag> & "amp"\n\x1b[31mred ansi\x1b[0m\n\x07bell\n${longLine}`;
const { subject, html, text } = buildJobFailureEmail('balikha-weekly-digest.service', sample);

assert(subject.includes('balikha-weekly-digest.service'), 'subject names the failed unit');
assert(text.includes('balikha-weekly-digest.service'), 'text names the failed unit');
assert(html.includes('&lt;tag&gt;') && html.includes('&amp;'), 'html escapes < > &');
assert(!html.includes('<tag>'), 'html does not contain raw <tag>');
assert(!html.includes('\x1b') && !text.includes('\x1b'), 'ANSI escape sequences stripped');
assert(!html.includes('\x07') && !text.includes('\x07'), 'bell control char stripped');
assert(html.includes(longLine), 'html preserves long lines');
assert(escapeHtml('a<b>c&d') === 'a&lt;b&gt;c&amp;d', 'escapeHtml escapes all three');
assert(stripControlChars('a\x00b').length === 'ab'.length, 'stripControlChars removes NUL');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll job-failure-alert format checks passed\n');
