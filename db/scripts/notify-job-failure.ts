import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Resend } from 'resend';
import { buildJobFailureEmail } from '@/lib/email/job-failure-alert';

const execFileAsync = promisify(execFile);

// systemd OnFailure handler target, invoked as:
//   notify-job-failure.ts <unit-name>
// where <unit-name> is `%I` from balikha-job-failure-alert@%n.service — the
// ALREADY-UNESCAPED instance name (e.g. balikha-weekly-digest.service).
//
// Dependency-minimal BY DESIGN (review Issues 2/3): imports no @/env (which
// validates the full prod schema at import and would fail on a drifted
// production.env — the very kind of misconfig that may have caused the job to
// fail) and no @/lib/logger (which imports @/env). Reads config from
// process.env with loud checks, logs via console (captured by the journal),
// and sends via the resend SDK directly. Does NO database work.
//
// No `import 'dotenv/config'` (round-2 review Issue 1): the handler unit
// supplies env via EnvironmentFile=/etc/balikha/production.env and is never
// run locally, so dotenv would only add a dependency on a transitive-only
// package — exactly the fragility this handler exists to avoid.
//
// EMAIL_FROM is read raw (round-2 review Issue 2): format validation is
// intentionally skipped (we do NOT import @/env). A malformed value surfaces
// loudly as a Resend send failure below — it is not silently swallowed. Do
// not "fix" this by re-coupling the handler to @/env.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // No-fallback / no-swallow: cannot alert without this — say so and fail.
    console.error(`job-failure-alert: ${name} is unset — cannot send failure alert`);
    process.exit(1);
  }
  return value;
}

async function readJournalTail(unit: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('journalctl', ['-u', unit, '-n', '30', '--no-pager']);
    return stdout.trim() || '(journal empty)';
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`job-failure-alert: could not read journal for ${unit}:`, e);
    return `(journal unavailable: ${reason} — check the box directly)`;
  }
}

async function main() {
  const unit = process.argv[2];
  if (!unit) {
    console.error('job-failure-alert: no unit name argument provided');
    process.exit(1);
  }
  // Guard the %I round-trip (review Issue 1): a real failing unit ends in
  // .service and resolves via systemctl cat. Fail loudly otherwise so a
  // mis-wired specifier can't silently email a garbage/empty journal.
  if (!unit.endsWith('.service')) {
    console.error(`job-failure-alert: argument is not a .service unit: ${unit}`);
    process.exit(1);
  }
  try {
    await execFileAsync('systemctl', ['cat', unit]);
  } catch {
    console.error(`job-failure-alert: unit does not resolve via systemctl cat: ${unit}`);
    process.exit(1);
  }

  const apiKey = requireEnv('RESEND_API_KEY');
  const from = requireEnv('EMAIL_FROM');
  const to = requireEnv('ADMIN_EMAIL');

  const journalTail = await readJournalTail(unit);
  const { subject, html, text } = buildJobFailureEmail(unit, journalTail);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error(`job-failure-alert: Resend send failed for ${unit}:`, error);
    process.exit(1);
  }
  console.warn(`job-failure-alert: sent for ${unit}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('job-failure-alert: failed:', e);
    process.exit(1);
  });
