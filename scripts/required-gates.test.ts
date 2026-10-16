/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGGREGATE,
  checkContract,
  compareProtection,
  decideRequiredGates,
  REQUIRED_GATES,
  renderInventory,
} from './required-gates.mjs';

type Result = 'success' | 'failure' | 'cancelled' | 'skipped';
type Gate = { check: string; job: string; judgedBy: 'aggregate' | 'branch protection' };

const GATES: Gate[] = REQUIRED_GATES;
const AGGREGATED = GATES.filter((gate) => gate.judgedBy === 'aggregate');

const SCRIPT = join(process.cwd(), 'scripts/required-gates.mjs');
const PR_INTO_MAIN = { event: 'pull_request', baseRef: 'main' };
const PUSH_TO_MAIN = { event: 'push', baseRef: '' };

const aggregatedJobs = AGGREGATED.map((gate) => gate.job);

function needsWith(overrides: Record<string, Result | undefined> = {}) {
  const needs: Record<string, { result: Result; outputs: object }> = {};
  for (const job of aggregatedJobs) {
    const result = job in overrides ? overrides[job] : 'success';
    if (result) {
      needs[job] = { result, outputs: {} };
    }
  }
  return needs;
}

function failingLanes(decision: { lanes: Array<{ job: string; pass: boolean }> }) {
  return decision.lanes.filter((lane) => !lane.pass).map((lane) => lane.job);
}

function repoFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const REAL_FILES = {
  'ci.yml': repoFile('.github/workflows/ci.yml'),
  'codeql.yml': repoFile('.github/workflows/codeql.yml'),
  'lighthouse.yml': repoFile('.github/workflows/lighthouse.yml'),
  'pr-quality.yml': repoFile('.github/workflows/pr-quality.yml'),
};

function contractErrors(
  edit: (files: typeof REAL_FILES) => Partial<typeof REAL_FILES> = () => ({}),
) {
  const files = { ...REAL_FILES, ...edit(REAL_FILES) };
  return checkContract({
    readWorkflow: (name: keyof typeof REAL_FILES) => files[name],
    inventory: renderInventory(),
  });
}

describe('decideRequiredGates', () => {
  it('passes when every required lane succeeded', () => {
    const decision = decideRequiredGates({ needs: needsWith(), run: PR_INTO_MAIN });
    expect(decision.ok).toBe(true);
    expect(decision.lanes.map((lane) => lane.job)).toEqual(aggregatedJobs);
  });

  it.each(['failure', 'cancelled'] as const)('fails a lane whose result is %s', (result) => {
    const decision = decideRequiredGates({ needs: needsWith({ e2e: result }), run: PR_INTO_MAIN });
    expect(decision.ok).toBe(false);
    expect(failingLanes(decision)).toEqual(['e2e']);
  });

  it('fails a required lane that reported no result', () => {
    const decision = decideRequiredGates({
      needs: needsWith({ test: undefined }),
      run: PR_INTO_MAIN,
    });
    expect(decision.ok).toBe(false);
    expect(failingLanes(decision)).toEqual(['test']);
  });

  it('fails a result it does not recognise', () => {
    const needs = { ...needsWith(), build: { result: 'neutral', outputs: {} } };
    const decision = decideRequiredGates({ needs, run: PR_INTO_MAIN });
    expect(failingLanes(decision)).toEqual(['build']);
  });

  it('fails a lane that was skipped although it applies to every event', () => {
    for (const run of [PR_INTO_MAIN, PUSH_TO_MAIN]) {
      const decision = decideRequiredGates({ needs: needsWith({ quality: 'skipped' }), run });
      expect(failingLanes(decision)).toEqual(['quality']);
    }
  });

  it('fails the up-to-date lane when it is skipped on a pull request into main', () => {
    const decision = decideRequiredGates({
      needs: needsWith({ 'up-to-date': 'skipped' }),
      run: PR_INTO_MAIN,
    });
    expect(failingLanes(decision)).toEqual(['up-to-date']);
  });

  it.each([
    ['a push to main', PUSH_TO_MAIN],
    ['a pull request into another branch', { event: 'pull_request', baseRef: 'release' }],
  ])('accepts the up-to-date lane as skipped on %s, where it does not apply', (_label, run) => {
    const decision = decideRequiredGates({ needs: needsWith({ 'up-to-date': 'skipped' }), run });
    expect(decision.ok).toBe(true);
  });
});

describe('the --decide CLI that the Required gates job runs', () => {
  function decide(needs: object, run = PR_INTO_MAIN) {
    return spawnSync('node', [SCRIPT, '--decide'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NEEDS: JSON.stringify(needs),
        EVENT_NAME: run.event,
        BASE_REF: run.baseRef,
      },
    });
  }

  it('exits 0 when every lane passed', () => {
    expect(decide(needsWith()).status).toBe(0);
  });

  it('exits 1 and names the lane when one was cancelled', () => {
    const result = decide(needsWith({ security: 'cancelled' }));
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Security audit');
  });

  it('exits 1 when the event name is missing, so no skip can be excused', () => {
    const result = spawnSync('node', [SCRIPT, '--decide'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NEEDS: JSON.stringify(needsWith({ 'up-to-date': 'skipped' })),
      },
    });
    expect(result.status).toBe(1);
  });

  it('exits 1 when the needs payload is missing', () => {
    const result = spawnSync('node', [SCRIPT, '--decide'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, EVENT_NAME: 'pull_request', BASE_REF: 'main' },
    });
    expect(result.status).toBe(1);
  });
});

describe('checkContract', () => {
  it('holds for the committed workflows and inventory', () => {
    expect(contractErrors()).toEqual([]);
    expect(repoFile('docs/required-gates.md')).toBe(renderInventory());
  });

  it('fails when a required lane is dropped from the aggregate needs', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(/(needs: \[.*), e2e/, '$1'),
    }));
    expect(errors.join('\n')).toMatch(/needs/);
  });

  it('fails when the aggregate no longer runs on cancellation or failure', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace('if: always()', 'if: !cancelled()'),
    }));
    expect(errors.join('\n')).toMatch(/always\(\)/);
  });

  it('fails when a required job is renamed', () => {
    const errors = contractErrors((files) => ({
      'codeql.yml': files['codeql.yml'].replace(
        'name: Analyze (javascript-typescript)',
        'name: Analyze',
      ),
    }));
    expect(errors.join('\n')).toContain('Analyze (javascript-typescript)');
  });

  it('fails when ci.yml gains a job the contract does not list', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': `${files['ci.yml']}\n  extra:\n    name: Extra lane\n    runs-on: ubuntu-latest\n`,
    }));
    expect(errors.join('\n')).toContain('extra');
  });

  it('fails when a lane gains a condition the contract does not declare', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '    name: Unit + component tests\n',
        "    name: Unit + component tests\n    if: github.event_name == 'push'\n",
      ),
    }));
    expect(errors.join('\n')).toContain('test');
  });

  it('fails when a lane reports failure as success through continue-on-error', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '    name: Security audit\n',
        '    name: Security audit\n    continue-on-error: true\n',
      ),
    }));
    expect(errors.join('\n')).toContain('continue-on-error');
  });

  it('fails when Lighthouse stops deciding its skip with the tested rule', () => {
    const errors = contractErrors((files) => ({
      'lighthouse.yml': files['lighthouse.yml'].replace(
        'run: node scripts/lighthouse-scope.mjs',
        'run: echo "ui-changed=false" >> "$GITHUB_OUTPUT"',
      ),
    }));
    expect(errors).toEqual([expect.stringContaining('scripts/lighthouse-scope.mjs')]);
  });

  it.each([
    [
      'the decision step is deleted',
      /\n {6}- name: Every required lane passed[\s\S]*--decide\n/,
      '\n',
    ],
    [
      'the decision step can fail quietly',
      'run: node scripts/required-gates.mjs --decide',
      'run: node scripts/required-gates.mjs --decide\n        continue-on-error: true',
    ],
    [
      'the decision step skips on cancellation',
      /(Every required lane passed\n {8})if: always\(\)/,
      '$1if: !cancelled()',
    ],
  ])('fails when %s', (_label, from, to) => {
    const errors = contractErrors((files) => ({ 'ci.yml': files['ci.yml'].replace(from, to) }));
    expect(errors).toEqual([expect.stringContaining('differs from the contract')]);
  });

  it.each([
    [
      'a lane step only runs on some events',
      'ci.yml',
      '      - run: pnpm test:coverage\n',
      "      - run: pnpm test:coverage\n        if: github.event_name == 'push'\n",
      'job `test` step "pnpm test:coverage" has `if: github.event_name == \'push\'`',
    ],
    [
      'a stand-alone check step never runs',
      'pr-quality.yml',
      '      - name: Validate\n',
      '      - name: Validate\n        if: false\n',
      'job `pr-body` step "Validate" has `if: false`',
    ],
    [
      'a lane step runs only after a failure',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: pnpm e2e\n        if: failure()\n',
      'job `e2e` step "pnpm e2e" has `if: failure()`',
    ],
    [
      'a lane step reports failure as success',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: pnpm e2e\n        continue-on-error: true\n',
      'job `e2e` step "pnpm e2e" sets `continue-on-error`',
    ],
    [
      'a lane command ends in || true',
      'ci.yml',
      'run: pnpm test:coverage\n',
      'run: pnpm test:coverage || true\n',
      'job `test` step "pnpm test:coverage || true" ignores its exit code with `|| true`',
    ],
    [
      'a lane command ends in || :',
      'ci.yml',
      'run: pnpm build\n',
      'run: pnpm build || :\n',
      'job `build` step "pnpm build || :" ignores its exit code with `|| :`',
    ],
    [
      'a lane command ends in || exit 0',
      'codeql.yml',
      '      - uses: github/codeql-action/analyze@v4\n',
      '      - run: npx tsc || exit 0\n      - uses: github/codeql-action/analyze@v4\n',
      'job `analyze` step "npx tsc || exit 0" ignores its exit code with `|| exit 0`',
    ],
    [
      'a multi-line run block turns off errexit',
      'ci.yml',
      '          expected="fallow',
      '          set +e\n          expected="fallow',
      'job `fallow` step "Assert the Fallow CLI matches the package.json pin" ignores its exit code with `set +e`',
    ],
  ])('fails when %s', (_label, workflow, from, to, message) => {
    const errors = contractErrors((files) => ({
      [workflow]: files[workflow as keyof typeof REAL_FILES].replace(from, to),
    }));
    expect(errors).toEqual([expect.stringContaining(message)]);
  });

  it.each([
    ['set +ex', 'set +ex'],
    ['set +o errexit', 'set +o errexit'],
  ])('fails when a run block turns off errexit with %s', (_label, command) => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '          expected="fallow',
        `          ${command}\n          expected="fallow`,
      ),
    }));
    expect(errors).toEqual([expect.stringContaining('ignores its exit code with `set +e`')]);
  });

  it.each([
    [
      'its steps are indented less than the repo layout',
      'pr-quality.yml',
      /\n {4}steps:\n[\s\S]*$/,
      '\n    steps:\n    - name: Validate\n      if: false\n      run: node scripts/validate-pr-body.mjs\n',
    ],
    [
      'a command continues onto the next line',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: pnpm e2e\n          || true\n',
    ],
    [
      'a run block has an indent indicator',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: |2\n          pnpm e2e || true\n',
    ],
    [
      'a run block body sits off the layout',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: |\n         pnpm e2e || true\n',
    ],
    [
      'a step is written in flow style',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - { run: pnpm e2e || true }\n',
    ],
    [
      'a step condition is a block scalar',
      'ci.yml',
      '      - run: pnpm e2e\n',
      '      - run: pnpm e2e\n        if: >-\n          false\n',
    ],
  ])('fails closed when %s', (_label, workflow, from, to) => {
    const errors = contractErrors((files) => ({
      [workflow]: files[workflow as keyof typeof REAL_FILES].replace(from, to),
    }));
    expect(errors).toContainEqual(expect.stringMatching(new RegExp(`^${workflow} line \\d+ `)));
  });

  it('passes a step that sets continue-on-error to false', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '      - run: pnpm e2e\n',
        '      - run: pnpm e2e\n        continue-on-error: false\n',
      ),
    }));
    expect(errors).toEqual([]);
  });

  it("fails when a lane borrows another gate's skip condition", () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '      - run: pnpm e2e\n',
        "      - run: pnpm e2e\n        if: steps.changes.outputs.ui-changed == 'true'\n",
      ),
    }));
    expect(errors).toEqual([expect.stringContaining('job `e2e` step "pnpm e2e" has `if:')]);
  });

  it('passes evidence uploads that run on failure and may not fail the lane', () => {
    const ci = REAL_FILES['ci.yml'];
    expect(ci).toMatch(/upload-artifact@v7\n {8}if: failure\(\)\n {8}continue-on-error: true/);
    expect(contractErrors()).toEqual([]);
  });

  it('passes steps that run in more cases than the default', () => {
    const errors = contractErrors((files) => ({
      'ci.yml': files['ci.yml'].replace(
        '      - run: pnpm test:coverage\n',
        '      - run: pnpm test:coverage\n        if: always()\n',
      ),
    }));
    expect(errors).toEqual([]);
  });

  it('fails when the inventory is stale', () => {
    const errors = checkContract({
      readWorkflow: (name: keyof typeof REAL_FILES) => REAL_FILES[name],
      inventory: renderInventory().replace('Security audit', 'Security'),
    });
    expect(errors.join('\n')).toContain('pnpm gates:inventory');
  });
});

describe('compareProtection', () => {
  const selectable = [
    AGGREGATE.check,
    ...GATES.filter((gate) => gate.judgedBy === 'branch protection').map((gate) => gate.check),
  ];

  it('passes when branch protection requires the aggregate and every stand-alone check', () => {
    expect(compareProtection({ contexts: selectable }).errors).toEqual([]);
  });

  it('names the checks branch protection still needs to require', () => {
    const lanes = AGGREGATED.filter((gate) => gate.job !== 'up-to-date').map((gate) => gate.check);
    const { errors } = compareProtection({
      contexts: [...lanes, ...selectable.slice(1)],
    });
    expect(errors).toEqual([expect.stringContaining(AGGREGATE.check)]);
  });

  it('flags a required context that no workflow job reports', () => {
    const { errors } = compareProtection({ contexts: [...selectable, 'Visual style'] });
    expect(errors).toEqual([expect.stringContaining('Visual style')]);
  });
});
