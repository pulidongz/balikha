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

section('encodeCursor — tiebreaker id can be any string (uuid or composite key)');
// getFollowingPage uses artisanProfileId (not a row id) as the tiebreaker — any
// string must survive the round-trip.
const composite = encodeCursor(when, 'artisan-profile-uuid-xyz');
assert(decodeCursor(composite)?.id === 'artisan-profile-uuid-xyz', 'non-id tiebreaker round-trips');

finish('All cursor checks passed');
