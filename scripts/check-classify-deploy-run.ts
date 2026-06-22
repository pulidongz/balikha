import assert from 'node:assert/strict';
import { classifyDeployRun, type ClassifyInput } from './lib/classify-deploy-run';

const SHA = 'abc1234def5678';
const base: ClassifyInput = {
  targetSha: SHA,
  deployedSha: null,
  run: { status: 'completed', conclusion: 'failure' },
  annotations: [],
  executedSteps: 0,
};

let passed = 0;
function check(name: string, input: ClassifyInput, expected: string) {
  const decision = classifyDeployRun(input);
  assert.equal(
    decision.action,
    expected,
    `${name}: expected "${expected}", got "${decision.action}" — ${decision.reason}`,
  );
  console.error('  ✓', name, `→ ${decision.action}`);
  passed++;
}

check('box already on target commit → skip', { ...base, deployedSha: SHA }, 'skip');
check('no run yet → wait', { ...base, run: null }, 'wait');
check(
  'run in progress → wait',
  { ...base, run: { status: 'in_progress', conclusion: null } },
  'wait',
);
check('run queued → wait', { ...base, run: { status: 'queued', conclusion: null } }, 'wait');
check(
  'CI success → skip',
  { ...base, run: { status: 'completed', conclusion: 'success' } },
  'skip',
);
check(
  'failure + billing annotation → deploy',
  {
    ...base,
    annotations: [
      'The job was not started because recent account payments have failed or your spending limit needs to be increased.',
    ],
  },
  'deploy',
);
check(
  'failure + spending-limit annotation → deploy',
  { ...base, annotations: ['Spending limit reached'] },
  'deploy',
);
check(
  'failure, real error (steps ran, no billing text) → abort',
  { ...base, executedSteps: 7, annotations: ['Process completed with exit code 1'] },
  'abort',
);
check(
  'failure, zero steps but NO billing annotation → abort (no masking)',
  { ...base, executedSteps: 0, annotations: [] },
  'abort',
);
check(
  'unexpected conclusion → abort',
  { ...base, run: { status: 'completed', conclusion: 'cancelled' } },
  'abort',
);
check(
  'deployedSha set but different + success → skip',
  { ...base, deployedSha: 'oldsha000', run: { status: 'completed', conclusion: 'success' } },
  'skip',
);

console.error(`\n${passed} checks passed`);
