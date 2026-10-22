#!/usr/bin/env node
/**
 * The required-gate contract: the one list of checks that must pass before a
 * pull request merges, and the fail-closed decision the `Required gates` job
 * makes over them (ADR 0017).
 *
 * Every required check is judged in one of two places. Lanes in `ci.yml` are
 * judged by the `Required gates` aggregate job, which reads their results
 * through `needs`. Checks in their own workflows (CodeQL, Lighthouse, PR body)
 * are required directly in branch protection, because they run on triggers
 * `ci.yml` does not share.
 *
 * CLI modes:
 *   --decide      Judge the `NEEDS` payload (`toJSON(needs)`) for the run in
 *                 `EVENT_NAME` and `BASE_REF`. Exits 1 unless every lane passes.
 *   --check       Fail when the workflows or `docs/required-gates.md` drift
 *                 from the contract.
 *   --write       Regenerate `docs/required-gates.md`.
 *   --protection  Compare branch protection's required checks (JSON on stdin)
 *                 with the contract.
 */

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = 'docs/required-gates.md';

/** The aggregate job in `ci.yml` and the check name branch protection selects. */
export const AGGREGATE = { check: 'Required gates', workflow: 'ci.yml', job: 'required-gates' };

/**
 * Every required check. `judgedBy: 'aggregate'` lanes must be `needs` of the
 * aggregate job. `appliesTo` is the only way a lane may be skipped: the job's
 * `if:` must be exactly the rendered rule, and a skip outside it fails. A
 * stand-alone check pins its job-level `if:` verbatim. A job that skips its own
 * work inside a step names the tested script that decides it in `skipRule.run`,
 * and `skipRule.when` is the one step condition that may skip that work.
 */
export const REQUIRED_GATES = [
  {
    check: 'Branch contains main',
    workflow: 'ci.yml',
    job: 'up-to-date',
    judgedBy: 'aggregate',
    appliesTo: { event: 'pull_request', baseRef: 'main' },
    local: 'pre-commit and pre-push hooks',
  },
  {
    check: 'Type check · lint · format',
    workflow: 'ci.yml',
    job: 'quality',
    judgedBy: 'aggregate',
    local: '`pnpm verify`, pre-push hook',
  },
  {
    check: 'Code intelligence (Fallow)',
    workflow: 'ci.yml',
    job: 'fallow',
    judgedBy: 'aggregate',
    local: '`pnpm verify`, pre-push hook',
  },
  {
    check: 'Unit + component tests',
    workflow: 'ci.yml',
    job: 'test',
    judgedBy: 'aggregate',
    local: '`pnpm verify`, pre-push hook',
  },
  {
    check: 'Production build',
    workflow: 'ci.yml',
    job: 'build',
    judgedBy: 'aggregate',
    local: '`pnpm verify`, pre-push hook',
  },
  {
    check: 'End-to-end behaviour map',
    workflow: 'ci.yml',
    job: 'e2e',
    judgedBy: 'aggregate',
    local: '`pnpm e2e`, pre-push hook',
  },
  {
    check: 'Security audit',
    workflow: 'ci.yml',
    job: 'security',
    judgedBy: 'aggregate',
    local: 'Hosted only. Pre-commit scans staged files for secrets.',
  },
  {
    check: 'Analyze (javascript-typescript)',
    workflow: 'codeql.yml',
    job: 'analyze',
    judgedBy: 'branch protection',
    local: 'Hosted only.',
  },
  {
    check: 'Lighthouse budgets',
    workflow: 'lighthouse.yml',
    job: 'lighthouse',
    judgedBy: 'branch protection',
    skipRule: {
      run: 'node scripts/lighthouse-scope.mjs',
      when: "steps.changes.outputs.ui-changed == 'true'",
    },
    appliesWhen:
      'Pull requests. Audits run only when `scripts/lighthouse-scope.mjs` finds UI-relevant files; otherwise the job passes without auditing.',
    local: '`node scripts/lighthouse-scope.mjs origin/main...HEAD`, then `pnpm build && pnpm lhci`',
  },
  {
    check: 'Visual regression',
    workflow: 'visual.yml',
    job: 'visual',
    judgedBy: 'branch protection',
    skipRule: {
      run: 'node scripts/lighthouse-scope.mjs',
      when: "steps.changes.outputs.ui-changed == 'true'",
    },
    appliesWhen:
      'Pull requests. Reference screenshots run on the same UI-relevant changes as Lighthouse; other changes pass without capturing.',
    local: '`pnpm visual` (Linux Chromium)',
  },
  {
    check: 'Validate PR body and title',
    workflow: 'pr-quality.yml',
    job: 'pr-body',
    judgedBy: 'branch protection',
    if: "!endsWith(github.event.pull_request.user.login, '[bot]')",
    appliesWhen: 'Pull requests not opened by a bot account.',
    local: '`pnpm validate:pr` with `PR_TITLE` and `PR_BODY` set',
  },
];

const AGGREGATED = REQUIRED_GATES.filter((gate) => gate.judgedBy === 'aggregate');
const STAND_ALONE = REQUIRED_GATES.filter((gate) => gate.judgedBy === 'branch protection');

/** The checks a maintainer requires in branch protection. */
const SELECTABLE_CHECKS = [AGGREGATE.check, ...STAND_ALONE.map((gate) => gate.check)];

function renderCondition({ event, baseRef }) {
  return `github.event_name == '${event}' && github.base_ref == '${baseRef}'`;
}

function expectedCondition(gate) {
  return gate.appliesTo ? renderCondition(gate.appliesTo) : gate.if;
}

function appliesToRun(gate, run) {
  if (!gate.appliesTo) {
    return true;
  }
  return run.event === gate.appliesTo.event && run.baseRef === gate.appliesTo.baseRef;
}

function judgeLane(gate, result, run) {
  if (result === undefined) {
    return { pass: false, reason: 'reported no result' };
  }
  if (result === 'success') {
    return { pass: true, reason: 'success' };
  }
  if (result === 'skipped' && !appliesToRun(gate, run)) {
    return { pass: true, reason: `skipped, does not apply to ${run.event} into "${run.baseRef}"` };
  }
  if (result === 'skipped') {
    return { pass: false, reason: 'skipped although it applies to this run' };
  }
  return { pass: false, reason: result };
}

/**
 * Judge every aggregated lane. `needs` is the `toJSON(needs)` object keyed by
 * job id; `run` is `{ event, baseRef }`. Pure.
 */
export function decideRequiredGates({ needs, run }) {
  const lanes = AGGREGATED.map((gate) => ({
    job: gate.job,
    check: gate.check,
    ...judgeLane(gate, needs[gate.job]?.result, run),
  }));
  return { ok: lanes.every((lane) => lane.pass), lanes };
}

/**
 * Step leniency that cannot turn a failed lane green. A step condition here
 * runs the step in every case the default would. An evidence step only uploads
 * what a lane produced, so it may run on failure and may not fail the lane.
 */
const STEP_POLICY = {
  widening: ['always()', '!cancelled()'],
  evidence: { uses: /^actions\/upload-artifact@/, conditions: ['failure()'] },
  ignoredExit: [
    { label: '|| true', pattern: /\|\|\s*true\b/ },
    { label: '|| :', pattern: /\|\|\s*:(?=\s|;|$)/m },
    { label: '|| exit 0', pattern: /\|\|\s*exit\s+0\b/ },
    { label: 'set +e', pattern: /\bset\b[^\n;]*(?:\s\+[a-z]*e|\+o\s+errexit)/ },
  ],
};

const FIELD = /^([\w-]+):(?:\s+(.*?))?\s*$/;
const BLOCK_HEADER = /^[|>][-+]?$/;

/** The lines under `jobs:` with their line numbers, without blanks and comments. */
function jobLines(workflowText) {
  const lines = workflowText.split('\n').map((text, index) => ({ text, number: index + 1 }));
  const start = lines.findIndex(({ text }) => /^jobs:\s*$/.test(text));
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex(({ text }, index) => index > start && /^\S/.test(text));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter(({ text }) => !/^\s*(#.*)?$/.test(text));
}

/**
 * Read each job's fields and each step's fields, with `run:` block scalars
 * collected. The workflows keep one layout (jobs at 2 spaces, job fields at 4,
 * steps at 6, step fields at 8, nested content at 10 or deeper), so a line
 * reader is enough and needs no YAML dependency. Any line outside that layout
 * is a problem, so a step the reader cannot see fails the check instead of
 * passing it unread.
 */
function parseJobs(workflowText) {
  const jobs = new Map();
  const problems = [];
  const state = { jobs, job: undefined, step: undefined, jobKey: undefined, nested: 'reject' };
  for (const { text, number } of jobLines(workflowText)) {
    if (!readLine(state, text)) {
      problems.push(
        `line ${number} has a layout the contract reader does not check: "${text.trim()}". ` +
          'Use the layout of the other workflow jobs so every step stays checked.',
      );
    }
  }
  return { jobs, problems };
}

function readLine(state, line) {
  const indent = line.search(/\S/);
  const field = line.trim().match(FIELD);
  if (indent === 2) {
    return startJob(state, field);
  }
  if (!state.job) {
    return false;
  }
  if (indent === 4) {
    state.jobKey = field?.[1];
    return field !== null && setField(state, state.job, field[1], field[2]);
  }
  if (state.jobKey === 'steps') {
    return readStepLine(state, line, indent);
  }
  return state.nested === 'opaque';
}

function startJob(state, field) {
  Object.assign(state, { job: undefined, step: undefined, jobKey: undefined });
  if (!field || field[2] !== undefined) {
    return false;
  }
  state.job = { steps: [] };
  state.jobs.set(field[1], state.job);
  return true;
}

function readStepLine(state, line, indent) {
  if (indent >= 10) {
    return readNested(state, line);
  }
  const step = indent === 6 ? line.trim().match(/^- (.*)$/)?.[1] : line.trim();
  const field = indent === 6 || indent === 8 ? step?.match(FIELD) : null;
  if (!field) {
    return false;
  }
  if (indent === 6) {
    state.step = {};
    state.job.steps.push(state.step);
  }
  return state.step !== undefined && setField(state, state.step, field[1], field[2]);
}

function readNested(state, line) {
  if (state.nested === 'run') {
    state.step.run += `${line.slice(10)}\n`;
  }
  return state.nested !== 'reject';
}

/**
 * Set a job or step field and decide how to read the lines nested under it: a
 * `run: |` block collects its text, a mapping such as `with:` is skipped, and
 * anything under a plain value is a problem.
 */
function setField(state, target, key, value) {
  if (value === undefined) {
    state.nested = 'opaque';
    return !['run', 'if', 'continue-on-error', 'name'].includes(key);
  }
  if (/^[|>]/.test(value)) {
    const isRunBlock = key === 'run' && BLOCK_HEADER.test(value);
    state.nested = isRunBlock ? 'run' : 'opaque';
    target[key] = '';
    return isRunBlock;
  }
  state.nested = 'reject';
  target[key] = unwrapExpression(value);
  return true;
}

/** `if: ${{ x }}` and `if: x` mean the same to GitHub; compare the bare form. */
function unwrapExpression(value) {
  return value.match(/^\$\{\{\s*(.*?)\s*\}\}$/)?.[1] ?? value;
}

function parseNeeds(needsText) {
  const flowList = needsText?.match(/^\[(.*)\]$/);
  return flowList ? flowList[1].split(',').map((job) => job.trim()) : undefined;
}

/** `continue-on-error: false` is the default, so only another value counts. */
function isSet(value) {
  return value !== undefined && value !== 'false';
}

function checkContinueOnError(where, job, errors) {
  if (isSet(job['continue-on-error'])) {
    errors.push(
      `${where} must not set \`continue-on-error\`; it reports a failed job as a success.`,
    );
  }
}

function checkGateJob(gate, job, errors) {
  const where = `${gate.workflow} job \`${gate.job}\``;
  if (!job) {
    errors.push(`${where} is missing. The contract requires "${gate.check}".`);
    return;
  }
  checkContinueOnError(where, job, errors);
  if (job.name !== gate.check) {
    errors.push(`${where} is named "${job.name}"; branch protection expects "${gate.check}".`);
  }
  const expected = expectedCondition(gate);
  if (job.if !== expected) {
    errors.push(
      `${where} has \`if: ${job.if ?? '(none)'}\`; the contract expects ` +
        `\`if: ${expected ?? '(none)'}\`. A skip outside the contract reads as a pass.`,
    );
  }
  if (gate.skipRule && !job.steps.some((step) => step.run === gate.skipRule.run)) {
    errors.push(
      `${where} must decide its skip with \`run: ${gate.skipRule.run}\`, the tested rule. ` +
        'An untested skip reads as a pass.',
    );
  }
  for (const step of job.steps) {
    checkStep(gate, step, `${where} step "${stepLabel(step)}"`, errors);
  }
}

function stepLabel(step) {
  return step.name ?? step.run?.split('\n')[0] ?? step.uses ?? step.id ?? '(unnamed)';
}

function allowedStepConditions(gate, isEvidence) {
  return [
    ...STEP_POLICY.widening,
    ...(isEvidence ? STEP_POLICY.evidence.conditions : []),
    ...(gate.skipRule ? [gate.skipRule.when] : []),
  ];
}

function checkStep(gate, step, where, errors) {
  const isEvidence = STEP_POLICY.evidence.uses.test(step.uses ?? '');
  if (isSet(step['continue-on-error']) && !isEvidence) {
    errors.push(
      `${where} sets \`continue-on-error\`; it reports a failed step as a success. ` +
        'Only evidence uploads may.',
    );
  }
  const allowed = allowedStepConditions(gate, isEvidence);
  if (step.if !== undefined && !allowed.includes(step.if)) {
    errors.push(
      `${where} has \`if: ${step.if}\`; a skipped step reads as a pass. ` +
        `Allowed here: ${allowed.map((condition) => `\`${condition}\``).join(', ')}.`,
    );
  }
  for (const { label, pattern } of STEP_POLICY.ignoredExit) {
    if (pattern.test(step.run ?? '')) {
      errors.push(
        `${where} ignores its exit code with \`${label}\`, so a failure reads as a pass.`,
      );
    }
  }
}

/** The whole aggregate job, so a removed or weakened step is drift too. */
export function renderAggregateJob() {
  return [
    `  ${AGGREGATE.job}:`,
    `    name: ${AGGREGATE.check}`,
    '    if: always()',
    `    needs: [${AGGREGATED.map((gate) => gate.job).join(', ')}]`,
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          persist-credentials: false',
    '      - uses: actions/setup-node@v6',
    '        with:',
    '          node-version-file: .nvmrc',
    '      - name: Workflows and inventory match the contract',
    '        run: node scripts/required-gates.mjs --check',
    '      - name: Every required lane passed',
    '        if: always()',
    '        env:',
    `          NEEDS: \${{ toJSON(needs) }}`,
    `          EVENT_NAME: \${{ github.event_name }}`,
    `          BASE_REF: \${{ github.base_ref }}`,
    '        run: node scripts/required-gates.mjs --decide',
  ].join('\n');
}

function aggregateBlock(workflowText) {
  const lines = workflowText.split('\n');
  const start = lines.indexOf(`  ${AGGREGATE.job}:`);
  if (start === -1) {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines
    .slice(start, end === -1 ? undefined : end)
    .join('\n')
    .trimEnd();
}

function checkAggregateJob(ciJobs, ciText, errors) {
  const aggregate = ciJobs.get(AGGREGATE.job);
  const where = `ci.yml job \`${AGGREGATE.job}\``;
  if (!aggregate) {
    errors.push(`${where} is missing. It produces the "${AGGREGATE.check}" result.`);
    return;
  }
  checkContinueOnError(where, aggregate, errors);
  if (aggregate.name !== AGGREGATE.check) {
    errors.push(`${where} must be named "${AGGREGATE.check}".`);
  }
  if (aggregate.if !== 'always()') {
    errors.push(
      `${where} must use \`if: always()\`. Otherwise a failed or cancelled lane skips it, ` +
        'and a skipped check reads as a pass.',
    );
  }
  const needs = parseNeeds(aggregate.needs) ?? [];
  const expected = AGGREGATED.map((gate) => gate.job);
  const missing = expected.filter((job) => !needs.includes(job));
  const extra = needs.filter((job) => !expected.includes(job));
  if (missing.length > 0 || extra.length > 0) {
    errors.push(
      `${where} needs must be the aggregated lanes [${expected.join(', ')}]. ` +
        `Missing: [${missing.join(', ')}]. Not in the contract: [${extra.join(', ')}].`,
    );
  }
  if (aggregateBlock(ciText) !== renderAggregateJob()) {
    errors.push(
      `${where} differs from the contract. Its steps decide the result, so it must read ` +
        `exactly:\n${renderAggregateJob()}`,
    );
  }
}

/**
 * Check the workflows and the generated inventory against the contract.
 * `readWorkflow(fileName)` returns a workflow's text. Returns error strings.
 */
export function checkContract({ readWorkflow, inventory }) {
  const errors = [];
  const jobsByWorkflow = new Map();
  for (const gate of REQUIRED_GATES) {
    if (!jobsByWorkflow.has(gate.workflow)) {
      const { jobs, problems } = parseJobs(readWorkflow(gate.workflow));
      errors.push(...problems.map((problem) => `${gate.workflow} ${problem}`));
      jobsByWorkflow.set(gate.workflow, jobs);
    }
    checkGateJob(gate, jobsByWorkflow.get(gate.workflow).get(gate.job), errors);
  }

  const ciJobs = jobsByWorkflow.get(AGGREGATE.workflow);
  checkAggregateJob(ciJobs, readWorkflow(AGGREGATE.workflow), errors);
  for (const jobId of ciJobs.keys()) {
    if (jobId !== AGGREGATE.job && !AGGREGATED.some((gate) => gate.job === jobId)) {
      errors.push(
        `ci.yml job \`${jobId}\` is not in the contract. Add it to REQUIRED_GATES in ` +
          'scripts/required-gates.mjs so the aggregate judges it.',
      );
    }
  }

  if (inventory !== renderInventory()) {
    errors.push(`${INVENTORY_PATH} is stale. Run \`pnpm gates:inventory\` and commit the result.`);
  }
  return errors;
}

/**
 * Compare branch protection's required contexts with the contract. Returns
 * `{ errors, alsoRequired }`; `alsoRequired` lists aggregated lanes that are
 * required directly as well, which is allowed.
 */
export function compareProtection({ contexts }) {
  const known = new Set([AGGREGATE.check, ...REQUIRED_GATES.map((gate) => gate.check)]);
  const errors = [
    ...SELECTABLE_CHECKS.filter((check) => !contexts.includes(check)).map(
      (check) => `Branch protection does not require "${check}". Select it as a required check.`,
    ),
    ...contexts
      .filter((context) => !known.has(context))
      .map(
        (context) =>
          `Branch protection requires "${context}", but no contract job reports it. ` +
          'A required check that never reports blocks every pull request.',
      ),
  ];
  const alsoRequired = AGGREGATED.map((gate) => gate.check).filter((check) =>
    contexts.includes(check),
  );
  return { errors, alsoRequired };
}

function renderStepRules() {
  const quote = (values) => values.map((value) => `\`${value}\``).join(', ');
  const skipConditions = REQUIRED_GATES.filter((gate) => gate.skipRule).map(
    (gate) => `${gate.check}: \`${gate.skipRule.when}\``,
  );
  return [
    '- Sets `continue-on-error`, unless it is an evidence upload (`actions/upload-artifact`).',
    `- Has an \`if:\` other than ${quote(STEP_POLICY.widening)}, ` +
      `${quote(STEP_POLICY.evidence.conditions)} on an evidence upload, or the job's declared ` +
      `skip condition (${skipConditions.join('; ')}).`,
    `- Ignores a command's exit code with any of ${quote(STEP_POLICY.ignoredExit.map(({ label }) => label))}.`,
  ];
}

export function renderInventory() {
  const rows = REQUIRED_GATES.map((gate) => {
    const appliesWhen = gate.appliesTo
      ? `\`${gate.appliesTo.event}\` into \`${gate.appliesTo.baseRef}\`. Skipped elsewhere.`
      : (gate.appliesWhen ?? 'Every run.');
    const judgedBy = gate.judgedBy === 'aggregate' ? `\`${AGGREGATE.check}\`` : 'Branch protection';
    return `| ${gate.check} | \`${gate.workflow}\` \`${gate.job}\` | ${judgedBy} | ${appliesWhen} | ${gate.local} |`;
  });
  return [
    '# Required gates',
    '',
    '<!-- Generated by `pnpm gates:inventory` from scripts/required-gates.mjs. Edit the script, then regenerate. -->',
    '',
    'Every check a pull request into `main` must pass. `pnpm gates:check` fails',
    'when this file or the workflows drift from the contract. The reasoning lives',
    'in `.agents/project/QUALITY_GATES.md` and ADR 0017.',
    '',
    '| Check | Workflow job | Judged by | Applies when | Local mirror |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Step rules',
    '',
    'Inside every job above, `pnpm gates:check` also fails on a step that:',
    '',
    ...renderStepRules(),
    '',
    '## Checks to require in branch protection',
    '',
    ...SELECTABLE_CHECKS.map((check) => `- ${check}`),
    '',
    'Compare the live settings with',
    '`gh api repos/OWNER/REPO/branches/main/protection/required_status_checks | node scripts/required-gates.mjs --protection`.',
    '',
  ].join('\n');
}

function readRepositoryFile(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function readJsonEnv(name) {
  try {
    return JSON.parse(process.env[name] ?? '');
  } catch {
    return undefined;
  }
}

function report(errors, okMessage) {
  if (errors.length === 0) {
    console.log(okMessage);
    process.exit(0);
  }
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  process.exit(1);
}

function runDecide() {
  const needs = readJsonEnv('NEEDS');
  if (typeof needs !== 'object' || needs === null) {
    report(['NEEDS is not the JSON object from `toJSON(needs)`.'], '');
  }
  if (!process.env.EVENT_NAME) {
    report(['EVENT_NAME is empty, so no lane can be judged as not applicable.'], '');
  }
  const run = { event: process.env.EVENT_NAME, baseRef: process.env.BASE_REF ?? '' };
  const decision = decideRequiredGates({ needs, run });
  for (const lane of decision.lanes) {
    console.log(`${lane.pass ? '✓' : '✗'} ${lane.check}: ${lane.reason}`);
  }
  report(
    decision.ok ? [] : ['At least one required lane did not pass.'],
    'Every required lane passed.',
  );
}

function runProtection() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const contexts = input.contexts ?? input.required_status_checks?.contexts ?? [];
  const { errors, alsoRequired } = compareProtection({ contexts });
  if (alsoRequired.length > 0) {
    console.log(`Also required directly (allowed): ${alsoRequired.join(', ')}.`);
  }
  report(errors, 'Branch protection requires every check the contract selects.');
}

function runCli(mode) {
  if (mode === '--decide') {
    runDecide();
  } else if (mode === '--check') {
    const errors = checkContract({
      readWorkflow: (name) => readRepositoryFile(`.github/workflows/${name}`),
      inventory: readRepositoryFile(INVENTORY_PATH),
    });
    report(errors, 'Required-gate contract matches the workflows and the inventory.');
  } else if (mode === '--write') {
    writeFileSync(resolve(REPOSITORY_ROOT, INVENTORY_PATH), renderInventory());
    console.log(`Wrote ${INVENTORY_PATH}.`);
  } else if (mode === '--protection') {
    runProtection();
  } else {
    report(['Usage: required-gates.mjs --decide | --check | --write | --protection'], '');
  }
}

// realpath and pathToFileURL keep the guard true for symlinked or spaced paths;
// a false guard would exit 0 without deciding.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv[2]);
}
