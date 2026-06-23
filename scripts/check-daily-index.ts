import assert from 'node:assert/strict';
import { dailyPick, manilaDateKey } from '../lib/queries/daily-index';

let passed = 0;
function ok(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  console.error('  ✓', name);
  passed++;
}

const IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
];

// Always returns one of the candidates
ok('returns a candidate', IDS.includes(dailyPick('2026-06-23', IDS)));

// Single candidate → that candidate
ok('single id → that id', dailyPick('2026-06-23', ['solo-artist-id']) === 'solo-artist-id');

// Determinism: same (dateKey, ids) → same winner
ok('deterministic for a given date', dailyPick('2026-06-23', IDS) === dailyPick('2026-06-23', IDS));

// Order-independence: shuffling the input doesn't change the winner
ok(
  'order-independent',
  dailyPick('2026-06-23', IDS) === dailyPick('2026-06-23', [...IDS].reverse()),
);

// Stability: removing ANY non-winning id does not change the winner (the core
// rendezvous property — this is what positional indexing failed).
{
  const key = '2026-06-23';
  const winner = dailyPick(key, IDS);
  const stable = IDS.filter((id) => id !== winner).every(
    (loser) =>
      dailyPick(
        key,
        IDS.filter((id) => id !== loser),
      ) === winner,
  );
  ok('removing any non-winner keeps the winner', stable);
}

// Empty → throws
{
  let threw = false;
  try {
    dailyPick('2026-06-23', []);
  } catch {
    threw = true;
  }
  ok('empty ids throws', threw);
}

// Uniformity (the fairness guarantee): over many consecutive days, every artist
// wins and counts are roughly balanced. Generous tolerance to stay non-flaky
// while still catching a clustered/biased hash.
{
  const DAYS = 300;
  const base = Date.UTC(2026, 0, 1, 4, 0, 0); // 04:00Z ≈ noon Manila, safely mid-day
  const counts = new Map<string, number>(IDS.map((id) => [id, 0]));
  for (let d = 0; d < DAYS; d++) {
    const key = manilaDateKey(new Date(base + d * 86_400_000));
    const w = dailyPick(key, IDS);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const values = [...counts.values()];
  const expected = DAYS / IDS.length; // 60
  ok(
    'every artist wins at least once',
    values.every((c) => c > 0),
    `counts=${values.join(',')}`,
  );
  ok(
    'no artist dominates or starves',
    values.every((c) => c > expected * 0.4 && c < expected * 1.6),
    `counts=${values.join(',')} expected≈${expected}`,
  );
}

// manilaDateKey: YYYY-MM-DD shape
ok('date key shape', /^\d{4}-\d{2}-\d{2}$/.test(manilaDateKey(new Date('2026-06-23T12:00:00Z'))));

// manilaDateKey: PH is UTC+8 — 15:30Z is still the 23rd in Manila...
ok('15:30Z → PH same day', manilaDateKey(new Date('2026-06-23T15:30:00Z')) === '2026-06-23');
// ...but 16:30Z (00:30 PH) has rolled to the 24th
ok('16:30Z → PH next day', manilaDateKey(new Date('2026-06-23T16:30:00Z')) === '2026-06-24');

console.error(`\n${passed} checks passed`);
