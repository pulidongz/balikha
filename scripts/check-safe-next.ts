/**
 * Guard on the open-redirect defense `safeNextOr` — the validator applied to
 * every `?next=` redirect target (sign-in/sign-up/verify-email). It must accept
 * only same-origin paths and fall back otherwise. Self-contained: no DB /
 * network / secrets. Run: npm run test:safe-next
 */
import { safeNextOr } from '../lib/safe-next';
import { assert, section, finish } from './lib/check-harness';

const FALLBACK = '/dashboard';

section('safeNextOr — accepts same-origin paths');
assert(safeNextOr('/account', FALLBACK) === '/account', 'plain path passes through');
assert(
  safeNextOr('/studio/maria-ceramics/vase-1', FALLBACK) === '/studio/maria-ceramics/vase-1',
  'nested path passes through',
);
assert(
  safeNextOr('/search?q=bowl&page=2', FALLBACK) === '/search?q=bowl&page=2',
  'path with query string passes through',
);
assert(safeNextOr('/orders#section', FALLBACK) === '/orders#section', 'path with fragment passes');

section('safeNextOr — rejects open-redirect vectors');
assert(safeNextOr('https://evil.example', FALLBACK) === FALLBACK, 'absolute URL rejected');
assert(safeNextOr('//evil.example', FALLBACK) === FALLBACK, 'protocol-relative // rejected');
assert(safeNextOr('/\\evil.example', FALLBACK) === FALLBACK, 'backslash trick /\\ rejected');
assert(safeNextOr('http://evil.example', FALLBACK) === FALLBACK, 'http absolute rejected');
assert(
  safeNextOr('javascript:alert(1)', FALLBACK) === FALLBACK,
  'javascript: scheme rejected (no leading /)',
);
assert(
  safeNextOr('/path with spaces', FALLBACK) === FALLBACK,
  'disallowed characters (space) rejected',
);
assert(
  safeNextOr('/path<script>', FALLBACK) === FALLBACK,
  'disallowed characters (angle brackets) rejected',
);

section('safeNextOr — falls back on empty/null');
assert(safeNextOr(null, FALLBACK) === FALLBACK, 'null falls back');
assert(safeNextOr('', FALLBACK) === FALLBACK, 'empty string falls back');
assert(safeNextOr('relative/no/slash', FALLBACK) === FALLBACK, 'path without leading / falls back');

finish('All safe-next open-redirect checks passed');
