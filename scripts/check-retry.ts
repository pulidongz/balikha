import { sendWithRetry } from '../lib/email/send-with-retry';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

async function main() {
  // Succeeds on the first attempt → no retries consumed.
  {
    let calls = 0;
    const result = await sendWithRetry(
      async () => {
        calls++;
        return { ok: true as const, data: 'ok' };
      },
      { retries: 2, delayMs: 0 },
    );
    assert(result.ok === true, 'returns ok when first attempt succeeds');
    assert(calls === 1, 'does not retry when first attempt succeeds');
  }

  // Fails twice, then succeeds → recovered within the retry budget.
  {
    let calls = 0;
    const result = await sendWithRetry(
      async () => {
        calls++;
        return calls < 3
          ? { ok: false as const, error: 'transient' }
          : { ok: true as const, data: 'ok' };
      },
      { retries: 2, delayMs: 0 },
    );
    assert(result.ok === true, 'recovers when a later attempt succeeds');
    assert(calls === 3, 'makes exactly 3 attempts (1 + 2 retries) before success');
  }

  // Always fails → exhausts the budget and returns the last failure.
  {
    let calls = 0;
    const result = await sendWithRetry(
      async () => {
        calls++;
        return { ok: false as const, error: 'persistent' };
      },
      { retries: 2, delayMs: 0 },
    );
    assert(result.ok === false, 'returns the failed result after exhausting retries');
    assert(calls === 3, 'makes exactly 3 attempts (1 + 2 retries) before giving up');
  }

  // shouldRetry=false stops further attempts even when the result is not ok.
  {
    let calls = 0;
    const result = await sendWithRetry(
      async () => {
        calls++;
        return { ok: false as const, error: 'permanent' };
      },
      { retries: 2, delayMs: 0, shouldRetry: () => false },
    );
    assert(result.ok === false, 'returns the failed result when shouldRetry is false');
    assert(calls === 1, 'does not retry when shouldRetry returns false');
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  process.stdout.write('\nAll send-with-retry checks passed\n');
}

main();
