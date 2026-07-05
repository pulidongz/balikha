import assert from 'node:assert/strict';
import { ok, err, type Result } from '../lib/result';
import { withInTxIdempotency } from '../lib/idempotency-in-tx';

// Minimal fake drizzle tx: records an ordered call log; select() resolves to
// `rows`; insert().values().onConflictDoNothing() records the inserted values.
function makeFakeTx(rows: unknown[]) {
  const log: string[] = [];
  let inserted: Record<string, unknown> | null = null;
  const tx = {
    async execute() {
      log.push('execute');
    },
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        async limit() {
          log.push('select');
          return rows;
        },
      };
    },
    insert() {
      return {
        values(v: Record<string, unknown>) {
          inserted = v;
          return this;
        },
        async onConflictDoNothing() {
          log.push('insert');
        },
      };
    },
  };
  return { tx, log, getInserted: () => inserted };
}

async function main() {
  // Case 1: fresh with key → lock, then select, then insert; run() executed once.
  {
    const { tx, log, getInserted } = makeFakeTx([]);
    let ran = 0;
    const outcome = await withInTxIdempotency<{ v: string }, { e: number }>(tx as never, {
      key: 'k1',
      scope: 'sc',
      userId: 'u1',
      run: async () => {
        ran += 1;
        return { result: ok({ v: 'R' }), extra: { e: 7 } };
      },
    });
    assert.deepEqual(log, ['execute', 'select', 'insert'], 'lock→recheck→insert order');
    assert.equal(ran, 1, 'run executed once');
    assert.equal(outcome.kind, 'fresh');
    assert.deepEqual(outcome.result, ok({ v: 'R' }));
    assert.equal((outcome as { extra: { e: number } }).extra.e, 7);
    const ins = getInserted()!;
    assert.equal(ins.key, 'k1');
    assert.equal(ins.scope, 'sc');
    assert.equal(ins.userId, 'u1');
    assert.equal(ins.responseJson, JSON.stringify(ok({ v: 'R' })), 'caches Result<T>');
  }

  // Case 2: cached hit, scope match → run() NOT called, returns cached; no insert.
  {
    const cached = {
      key: 'k1',
      scope: 'sc',
      userId: 'u1',
      responseJson: JSON.stringify(ok({ v: 'CACHED' })),
    };
    const { tx, log } = makeFakeTx([cached]);
    let ran = 0;
    const outcome = await withInTxIdempotency<{ v: string }, unknown>(tx as never, {
      key: 'k1',
      scope: 'sc',
      userId: 'u1',
      run: async () => {
        ran += 1;
        return { result: ok({ v: 'FRESH' }), extra: null };
      },
    });
    assert.deepEqual(log, ['execute', 'select'], 'lock then recheck, no insert');
    assert.equal(ran, 0, 'run NOT called on cache hit');
    assert.equal(outcome.kind, 'cached');
    assert.deepEqual(outcome.result, ok({ v: 'CACHED' }));
  }

  // Case 3: scope mismatch → exact error string.
  {
    const cached = { key: 'k1', scope: 'OTHER', userId: 'u1', responseJson: '"unused"' };
    const { tx } = makeFakeTx([cached]);
    const outcome = await withInTxIdempotency<{ v: string }, unknown>(tx as never, {
      key: 'k1',
      scope: 'sc',
      userId: 'u1',
      run: async () => ({ result: ok({ v: 'x' }), extra: null }),
    });
    assert.equal(outcome.kind, 'cached');
    assert.deepEqual(
      outcome.result as Result<{ v: string }>,
      err('Idempotency key already used for a different operation.'),
    );
  }

  // Case 4: userId mismatch → exact error string.
  {
    const cached = { key: 'k1', scope: 'sc', userId: 'someone-else', responseJson: '"unused"' };
    const { tx } = makeFakeTx([cached]);
    const outcome = await withInTxIdempotency<{ v: string }, unknown>(tx as never, {
      key: 'k1',
      scope: 'sc',
      userId: 'u1',
      run: async () => ({ result: ok({ v: 'x' }), extra: null }),
    });
    assert.equal(outcome.kind, 'cached');
    assert.deepEqual(
      outcome.result as Result<{ v: string }>,
      err('Idempotency key already used by a different user.'),
    );
  }

  // Case 5: no key → no tx ops at all; run() executes; fresh.
  {
    const { tx, log } = makeFakeTx([]);
    let ran = 0;
    const outcome = await withInTxIdempotency<{ v: string }, { e: number }>(tx as never, {
      key: null,
      scope: 'sc',
      userId: 'u1',
      run: async () => {
        ran += 1;
        return { result: ok({ v: 'R' }), extra: { e: 1 } };
      },
    });
    assert.deepEqual(log, [], 'no lock/recheck/insert without a key');
    assert.equal(ran, 1);
    assert.equal(outcome.kind, 'fresh');
  }

  console.error(
    '✓ withInTxIdempotency: lock→recheck→insert ordering, cache hit, scope/user guards, no-key path',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
