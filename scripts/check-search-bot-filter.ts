/**
 * Deterministic guard on the search bot-query classifier (ticket #114).
 * Self-contained: no DB / network / secrets. Run: npm run test:search-bot-filter
 */
import { isLikelyBotQuery } from '../lib/search/bot-filter';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

process.stdout.write('real queries are NOT flagged\n');
assert(!isLikelyBotQuery('blue stoneware vase'), 'short product query');
assert(!isLikelyBotQuery('handmade ceramic mug'), 'multi-word product query');
assert(!isLikelyBotQuery('barong tagalog'), 'two-token query');
assert(!isLikelyBotQuery('selection of bowls'), 'word "selection" not matched as select');
// False-positive guards (plan review #114): DML/comment patterns that occur
// in real product searches MUST survive. If any of these trip, loosen the
// signature — do NOT widen it to catch more bots at their expense.
assert(!isLikelyBotQuery('drop earrings'), '"drop earrings" — drop without table/database');
assert(!isLikelyBotQuery('drop spindle'), '"drop spindle" — fiber-craft tool');
assert(!isLikelyBotQuery('insert clay'), '"insert clay" — insert without into');
assert(!isLikelyBotQuery('update to my order'), '"update" without SET');
assert(!isLikelyBotQuery('delete this'), '"delete" without from');
assert(!isLikelyBotQuery('bowl -- gift'), 'human double-hyphen, not a SQLi tail');

process.stdout.write('bot/scanner payloads ARE flagged\n');
assert(isLikelyBotQuery("1' AND 1=1 UNION SELECT null,null FROM users--"), 'union-based SQLi');
assert(isLikelyBotQuery('select 0x7177 from information_schema.tables'), 'select..from + hex');
assert(isLikelyBotQuery("'; DROP TABLE products; --"), 'stacked DROP');
assert(isLikelyBotQuery('<script>alert(1)</script>'), 'XSS probe');
assert(isLikelyBotQuery('a'.repeat(120)), 'over-length string');
assert(
  isLikelyBotQuery('one two three four five six seven eight nine ten eleven twelve thirteen'),
  'too many tokens',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll search-bot-filter checks passed\n');
