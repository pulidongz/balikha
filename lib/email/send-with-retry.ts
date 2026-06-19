// Bounded retry wrapper for Result-returning async operations (e.g. sendEmail,
// which returns { ok: false } on a transient provider error rather than
// throwing). Generic and dependency-free on purpose: it imports no app
// modules, so it is unit-testable without env validation or a DB.
//
// Retries while the attempt resolves to `{ ok: false }`, up to `retries`
// extra attempts after the first, sleeping `delayMs` between attempts.
// `shouldRetry` (default: always) lets the caller stop early on a failure it
// knows retrying cannot fix (e.g. a permanent provider error). A thrown error
// propagates. Returns the last result.

export interface RetryOptions<T> {
  retries: number;
  delayMs: number;
  shouldRetry?: (result: T) => boolean;
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

export async function sendWithRetry<T extends { ok: boolean }>(
  attempt: () => Promise<T>,
  opts: RetryOptions<T>,
): Promise<T> {
  const shouldRetry = opts.shouldRetry ?? (() => true);
  let result = await attempt();
  let remaining = opts.retries;
  while (!result.ok && remaining > 0 && shouldRetry(result)) {
    await sleep(opts.delayMs);
    remaining--;
    result = await attempt();
  }
  return result;
}
