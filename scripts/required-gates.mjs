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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = 'docs/required-gates.md';

/** The aggregate job in `ci.yml` and the check name branch protection selects. */
export const AGGREGATE = { check: 'Required gates', workflow: 'ci.yml', job: 'required-gates' };

/**
 * Every required check. `judgedBy: 'aggregate'` lanes must be `needs` of the
 * aggregate job. `appliesTo` is the only way a lane may be skipped: the job's
 * `if:` must be exactly the rendered rule, and a skip outside it fails. A
 * stand-alone check pins its job-level `if:` verbatim.
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
    local: '`pnpm verify`',
  },
  {
    check: 'Code intelligence (Fallow)',
    workflow: 'ci.yml',
    job: 'fallow',
    judgedBy: 'aggregate',
    local: '`pnpm verify`',
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
    local: '`pnpm verify`',
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
    appliesWhen:
      'Pull requests. Audits run only when UI-relevant files change; otherwise the job passes without auditing.',
    local: '`pnpm build && pnpm lhci`',
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
 * Read the job ids under `jobs:` and each job's `name:`, `if:`,
 * `continue-on-error:`, and flow-list `needs:`. The workflows here keep those fields on one line, so a line reader
 * is enough and needs no YAML dependency.
 */
function parseJobs(workflowText) {
  const jobs = new Map();
  let inJobs = false;
  let current;
  for (const line of workflowText.split('\n')) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs || /^\s*(#.*)?$/.test(line)) {
      continue;
    }
    if (/^\S/.test(line)) {
      inJobs = false;
      continue;
    }
    const jobMatch = line.match(/^ {2}([\w-]+):\s*$/);
    if (jobMatch) {
      current = {};
      jobs.set(jobMatch[1], current);
      continue;
    }
    const fieldMatch = line.match(/^ {4}(name|if|needs|continue-on-error):\s*(.*?)\s*$/);
    if (current && fieldMatch) {
      current[fieldMatch[1]] = unwrapExpression(fieldMatch[2]);
    }
  }
  return jobs;
}

/** `if: ${{ x }}` and `if: x` mean the same to GitHub; compare the bare form. */
function unwrapExpression(value) {
  return value.match(/^\$\{\{\s*(.*?)\s*\}\}$/)?.[1] ?? value;
}

function parseNeeds(needsText) {
  const flowList = needsText?.match(/^\[(.*)\]$/);
  return flowList ? flowList[1].split(',').map((job) => job.trim()) : undefined;
}

function checkContinueOnError(where, job, errors) {
  if (job['continue-on-error'] !== undefined) {
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
}

function checkAggregateJob(ciJobs, errors) {
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
      jobsByWorkflow.set(gate.workflow, parseJobs(readWorkflow(gate.workflow)));
    }
    checkGateJob(gate, jobsByWorkflow.get(gate.workflow).get(gate.job), errors);
  }

  const ciJobs = jobsByWorkflow.get(AGGREGATE.workflow);
  checkAggregateJob(ciJobs, errors);
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
    '<!-- Generated by `pnpm gates:inventory` from scripts/required-gates.mjs. Do not edit. -->',
    '',
    'Every check a pull request into `main` must pass. `pnpm gates:check` fails',
    'when this file or the workflows drift from the contract. The reasoning lives',
    'in `.agents/project/QUALITY_GATES.md` and ADR 0017.',
    '',
    '| Check | Workflow job | Judged by | Applies when | Local mirror |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
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
  const run = { event: process.env.EVENT_NAME ?? '', baseRef: process.env.BASE_REF ?? '' };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv[2]);
}
