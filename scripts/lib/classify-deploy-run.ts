// Pure decision logic for the smart-deploy fallback. NO I/O — all inputs are
// passed in so this is fully unit-testable. See deploy-decide.ts for the
// gh/SSH layer that builds ClassifyInput.

export type DeployAction = 'deploy' | 'skip' | 'wait' | 'abort';

export interface ClassifyInput {
  /** Commit we want live on prod (current origin/main HEAD). */
  targetSha: string;
  /** Commit currently live on the box (from RELEASE_SHA), or null if unknown. */
  deployedSha: string | null;
  /** Latest "Release & deploy" run whose headSha === targetSha, or null if none exists yet. */
  run: { status: string; conclusion: string | null } | null;
  /** Annotation messages collected across the run's jobs. */
  annotations: string[];
  /** Count of steps that actually executed across all jobs (0 ⇒ jobs never started). */
  executedSteps: number;
}

export interface DeployDecision {
  action: DeployAction;
  reason: string;
}

// A GitHub billing block annotates the run with this kind of message. This is
// the ONLY signal that authorizes a local-deploy fallback. We intentionally do
// NOT treat "zero steps executed" alone as billing: a workflow-syntax error or
// runner outage also yields zero steps, and deploying over those would mask a
// real failure.
const BILLING_PATTERN = /payment|spending limit|billing/i;

function short(sha: string): string {
  return sha.slice(0, 7);
}

export function classifyDeployRun(input: ClassifyInput): DeployDecision {
  const { targetSha, deployedSha, run, annotations, executedSteps } = input;

  if (deployedSha && deployedSha === targetSha) {
    return { action: 'skip', reason: `Box already runs ${short(targetSha)} — nothing to deploy.` };
  }
  if (!run) {
    return {
      action: 'wait',
      reason: `No "Release & deploy" run found yet for ${short(targetSha)}.`,
    };
  }
  if (run.status !== 'completed') {
    return { action: 'wait', reason: `Run for ${short(targetSha)} is still "${run.status}".` };
  }
  if (run.conclusion === 'success') {
    return { action: 'skip', reason: `CI already deployed ${short(targetSha)}.` };
  }
  if (run.conclusion === 'failure') {
    const billingBlocked = annotations.some((a) => BILLING_PATTERN.test(a));
    if (billingBlocked) {
      return {
        action: 'deploy',
        reason: `CI for ${short(targetSha)} was billing-blocked — deploying locally.`,
      };
    }
    return {
      action: 'abort',
      reason: `CI for ${short(targetSha)} failed for a NON-billing reason (executedSteps=${executedSteps}). Refusing to deploy over a real failure.`,
    };
  }
  return {
    action: 'abort',
    reason: `Unexpected run conclusion "${run.conclusion}" for ${short(targetSha)}. Refusing to deploy.`,
  };
}
