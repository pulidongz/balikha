// Gathers the live view of the latest "Release & deploy" run for the target
// commit and prints a decision. Pure logic lives in lib/classify-deploy-run.
//
// Inputs (env):
//   TARGET_SHA    commit we want deployed (required)
//   DEPLOYED_SHA  commit currently live on the box, or empty/unknown
// Output:
//   stdout: JSON { action, reason }
//   stderr: human reason line
//   exit code: skip=0, abort=1, deploy=10, wait=20  (branchable from bash)
import { execFileSync } from 'node:child_process';
import { classifyDeployRun, type ClassifyInput } from './lib/classify-deploy-run';

const WORKFLOW = 'release.yml';
const EXIT = { skip: 0, abort: 1, deploy: 10, wait: 20 } as const;

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function repoSlug(): string {
  return JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner as string;
}

interface RunSummary {
  databaseId: number;
  headSha: string;
  status: string;
  conclusion: string | null;
}

function latestRunForSha(targetSha: string): RunSummary | null {
  const runs: RunSummary[] = JSON.parse(
    gh([
      'run',
      'list',
      '--workflow',
      WORKFLOW,
      '--branch',
      'main',
      '--limit',
      '30',
      '--json',
      'databaseId,headSha,status,conclusion',
    ]),
  );
  // gh returns newest-first; the first match for our SHA is the latest attempt.
  return runs.find((r) => r.headSha === targetSha) ?? null;
}

interface JobStep {
  conclusion: string | null;
}
interface Job {
  id: number;
  steps: JobStep[];
}

function jobsForRun(slug: string, runId: number): Job[] {
  const res = JSON.parse(gh(['api', `repos/${slug}/actions/runs/${runId}/jobs`, '--paginate']));
  return (res.jobs ?? []) as Job[];
}

function annotationsForJob(slug: string, jobId: number): string[] {
  try {
    const res = JSON.parse(gh(['api', `repos/${slug}/check-runs/${jobId}/annotations`]));
    return (res as Array<{ message: string }>).map((a) => a.message);
  } catch {
    // No annotations endpoint data for this job — not an error.
    return [];
  }
}

function main(): never {
  const targetSha = process.env.TARGET_SHA;
  if (!targetSha) {
    console.error('FATAL: TARGET_SHA is required');
    process.exit(EXIT.abort);
  }
  const deployedSha = (process.env.DEPLOYED_SHA ?? '').trim() || null;

  const slug = repoSlug();
  const run = latestRunForSha(targetSha);

  let annotations: string[] = [];
  let executedSteps = 0;
  if (run) {
    const jobs = jobsForRun(slug, run.databaseId);
    for (const job of jobs) {
      executedSteps += job.steps.filter(
        (s) => s.conclusion !== null && s.conclusion !== 'skipped',
      ).length;
      annotations = annotations.concat(annotationsForJob(slug, job.id));
    }
  }

  const input: ClassifyInput = {
    targetSha,
    deployedSha,
    run: run ? { status: run.status, conclusion: run.conclusion } : null,
    annotations,
    executedSteps,
  };

  const decision = classifyDeployRun(input);
  process.stdout.write(JSON.stringify(decision) + '\n');
  console.error(`decision: ${decision.action} — ${decision.reason}`);
  process.exit(EXIT[decision.action]);
}

main();
