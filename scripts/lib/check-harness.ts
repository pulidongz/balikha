// Shared assertion harness for scripts/check-*.ts. Keeps a per-process failure
// counter, prints ✓/✗ lines, and exits non-zero if any assertion failed.
// Extracted so new check scripts stop re-declaring the same inline harness.

let failures = 0;

export function assert(cond: boolean, msg: string): void {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

export function section(name: string): void {
  process.stdout.write(`${name}\n`);
}

// Call once at the end. Exits 1 (with a summary) if any assertion failed,
// otherwise prints the success label.
export function finish(successLabel: string): void {
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  process.stdout.write(`\n${successLabel}\n`);
}
