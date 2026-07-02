/**
 * Guard on the cursor primitive shared by every paginated query
 * (getRecentProducts, getFollowedFeed, getWishlistPage, getFollowingPage).
 * encode/decode must round-trip, and a tampered/malformed cursor must decode to
 * null (callers treat null as "page 1" — a tampered URL must never 500).
 * Self-contained: no DB / network / secrets. Run: npm run test:cursor
 */
import { encodeCursor, decodeCursor } from '../lib/queries/cursor';
import { assert, section, finish } from './lib/check-harness';

section('encodeCursor / decodeCursor — round-trip');
const when = new Date('2026-06-15T08:30:45.123Z');
const id = '4f9a2c1e-0000-4000-8000-000000000abc';
const token = encodeCursor(when, id);
const decoded = decodeCursor(token);
assert(decoded !== null, 'a freshly encoded cursor decodes to non-null');
assert(decoded?.id === id, 'id round-trips exactly');
assert(
  decoded?.createdAt.getTime() === when.getTime(),
  'createdAt round-trips at millisecond precision',
);
assert(!token.includes('=') && !token.includes('+') && !token.includes('/'), 'token is base64url');

section('decodeCursor — rejects bad input (returns null, never throws)');
assert(decodeCursor('') === null, 'empty string → null');
assert(decodeCursor('not-base64!!') === null, 'non-base64 garbage → null');
assert(
  decodeCursor(Buffer.from('{}').toString('base64url')) === null,
  'valid base64 but wrong shape → null',
);
assert(
  decodeCursor(Buffer.from(JSON.stringify({ c: 'not-a-date', i: 'x' })).toString('base64url')) ===
    null,
  'unparseable date → null',
);
assert(
  decodeCursor(Buffer.from(JSON.stringify({ c: when.toISOString() })).toString('base64url')) ===
    null,
  'missing id field → null',
);

section('decodeCursor — rejects a well-formed cursor with a non-uuid tiebreaker');
// Security (audit): a crafted base64url cursor with a valid ISO `c` but a
// non-uuid `i` must decode to null (→ page 1), NOT reach `lt(<uuid column>, 'x')`
// where Postgres throws a 22P02 cast error — an unauthenticated 500 on the
// public product page via ?comments=.
const craft = (i: string) =>
  Buffer.from(JSON.stringify({ c: when.toISOString(), i })).toString('base64url');
assert(decodeCursor(craft('x')) === null, 'non-uuid tiebreaker → null (no uuid-cast 500)');
assert(decodeCursor(craft('123')) === null, 'numeric-string tiebreaker → null');
assert(decodeCursor(craft("' OR 1=1--")) === null, 'sql-ish tiebreaker → null');

section('encodeCursor — a real uuid tiebreaker round-trips');
// getFollowingPage uses artisanProfileId (a uuid) as its tiebreaker.
const followUuid = '0b1e5d2a-1111-4222-8333-444455556666';
assert(
  decodeCursor(encodeCursor(when, followUuid))?.id === followUuid,
  'uuid tiebreaker round-trips',
);

finish('All cursor checks passed');
