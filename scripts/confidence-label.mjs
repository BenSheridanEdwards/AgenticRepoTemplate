#!/usr/bin/env node
/**
 * The merge-confidence label: how much a reviewer can trust a green pull
 * request. CI grades every PR `confidence: green`, `confidence: amber` or
 * `confidence: red` from three inputs (issue #69, ADR 0064):
 *
 * - **Gate results.** The required checks a maintainer selects in branch
 *   protection: the `Required gates` aggregate (ADR 0017) and the stand-alone
 *   checks. A failing or pending required check grades `red`, because a PR that
 *   has not passed its gates is the least trustworthy state.
 * - **E2E coverage of the changed files.** Each changed route or feature slice
 *   maps to the E2E specs in its own result that name it (the coarse, cheap
 *   measure of ADR 0064). A changed slice no spec names is a gap.
 * - **PRD status.** Each changed slice maps to the PRD in `docs/prd/` that
 *   names it and links a spec in its result. A slice without that PRD is a gap.
 *
 * A PR whose required checks all pass grades `green` with no gap, or `amber`
 * with one or more named gaps. The label grades a PR that is already green; the
 * gates themselves stay the fail-closed merge bar (ADR 0017).
 *
 * Rollout: these pieces expose tested helpers; the CLI modes below describe
 * the target interface delivered with the final workflow piece.
 * CLI modes:
 *   --decide   Grade the PR. Reads `CHECK_RUNS` (the head commit's check runs as
 *              JSON) and `CHANGED` (its changed files, one per line), reads the
 *              specs and PRDs as text from `PR_ROOT` (default: cwd), prints the
 *              level with its reasons, and
 *              writes `level` and `label` to `GITHUB_OUTPUT` and a summary to
 *              `GITHUB_STEP_SUMMARY`.
 *   --labels   Print the three label definitions (name, colour, description) as
 *              JSON, so the workflow can create any that the repository lacks.
 */

import { AGGREGATE, REQUIRED_GATES } from './required-gates.mjs';

/** A changed source file in `<result>/web/src/routes/<name>/` or `.../features/<name>/`. */
const SLICE_PATH = /^((?:apps|showcase\/[^/]+))\/web\/src\/(routes|features)\/([^/]+)\//;

/** The three levels, most trusted first, and the label each one applies. */
export const CONFIDENCE_LABELS = {
  green: 'confidence: green',
  amber: 'confidence: amber',
  red: 'confidence: red',
};

/** Each label's colour and description, for the workflow to create it when missing. */
export const CONFIDENCE_LABEL_DEFS = {
  green: {
    name: CONFIDENCE_LABELS.green,
    color: '2ea44f',
    description: 'Every required gate passed; every changed slice has an E2E spec and a PRD.',
  },
  amber: {
    name: CONFIDENCE_LABELS.amber,
    color: 'dbab09',
    description: 'Every required gate passed, with a named gap in E2E coverage or PRD status.',
  },
  red: {
    name: CONFIDENCE_LABELS.red,
    color: 'd73a49',
    description: 'A required gate is failing or pending.',
  },
};

/**
 * The checks a maintainer requires in branch protection, from the one contract
 * in `scripts/required-gates.mjs`: the `Required gates` aggregate and every
 * stand-alone check. These are the gate results the label grades.
 */
export function requiredCheckNames() {
  const standAlone = REQUIRED_GATES.filter((gate) => gate.judgedBy === 'branch protection');
  return [AGGREGATE.check, ...standAlone.map((gate) => gate.check)];
}

/** The route or feature slice a changed path belongs to, or undefined. */
export function sliceOf(path) {
  const match = SLICE_PATH.exec(path);
  return match ? { result: match[1], kind: match[2], name: match[3] } : undefined;
}

/** The unique route and feature slices the changed files touch, in order. */
export function collectSlices(changedFiles) {
  const slices = new Map();
  for (const file of changedFiles) {
    const slice = sliceOf(file);
    if (slice) {
      slices.set(`${slice.result}:${slice.kind}:${slice.name}`, slice);
    }
  }
  return [...slices.values()];
}

const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** True when `haystack` names `slice`: its normalized text contains the slice name. */
function names(slice, haystack) {
  return `-${normalize(haystack)}-`.includes(`-${normalize(slice.name)}-`);
}

/** The singular noun for a slice kind: `routes` → `route`, `features` → `feature`. */
const singular = (kind) => kind.replace(/s$/, '');

/**
 * The E2E coverage gaps: each changed slice no spec in its own result names.
 * `specs` is `{ path, text }` per spec. Pure.
 */
export function coverageGaps(slices, specs) {
  return slices
    .filter((slice) => {
      const resultSpecs = specs.filter((spec) => spec.path.startsWith(`${slice.result}/web/e2e/`));
      return !resultSpecs.some((spec) => names(slice, spec.path) || names(slice, spec.text));
    })
    .map(
      (slice) =>
        `The ${singular(slice.kind)} slice \`${slice.name}\` (${slice.result}) changed, and no ` +
        `E2E spec in \`${slice.result}/web/e2e/\` names it. Add a Playwright spec that exercises ` +
        'it, or name the spec that does.',
    );
}

/**
 * The PRD gaps: each changed slice no PRD names with a spec in its result.
 * `prds` is `{ path, text }` per PRD. Pure.
 */
export function prdGaps(slices, prds) {
  return slices
    .filter(
      (slice) =>
        !prds.some(
          (prd) => names(slice, prd.text) && prd.text.includes(`${slice.result}/web/e2e/`),
        ),
    )
    .map(
      (slice) =>
        `The ${singular(slice.kind)} slice \`${slice.name}\` (${slice.result}) changed, and no ` +
        'PRD in `docs/prd/` names it and links a spec in its result. Add or update a PRD ' +
        'that states its intent and links its E2E tests (ADR 0045).',
    );
}

/**
 * The required checks as `{ name, conclusion }`, from the head commit's check
 * runs. A name with no run is `missing`; a run still going is `pending`; a name
 * takes its latest run by started_at, then id. Only stand-alone gates with a
 * declared if may pass as skipped. Pure.
 *
 * @param {{ id?: number, started_at?: string, name: string, status?: string, conclusion?: string }[]} checkRuns
 */
export function requiredCheckResults(checkRuns, checkNames = requiredCheckNames()) {
  return checkNames.map((name) => {
    const latest = checkRuns
      .filter((run) => run.name === name)
      .sort(
        (left, right) =>
          (right.started_at ?? '').localeCompare(left.started_at ?? '') ||
          (right.id ?? 0) - (left.id ?? 0),
      )[0];
    if (!latest) {
      return { name, conclusion: 'missing' };
    }
    if (latest.status !== 'completed') {
      return { name, conclusion: 'pending' };
    }
    const mayBeSkipped = REQUIRED_GATES.some(
      (gate) => gate.check === name && gate.judgedBy === 'branch protection' && Boolean(gate.if),
    );
    return {
      name,
      conclusion: latest.conclusion === 'skipped' && mayBeSkipped ? 'success' : latest.conclusion,
    };
  });
}

/**
 * Grade the PR. `red` when any required check is not `success`, otherwise
 * `amber` when there is a gap and `green` when there is none. Pure.
 *
 * @param {{ requiredChecks: { name: string, conclusion: string }[], gaps: string[] }} input
 */
export function decideConfidence({ requiredChecks, gaps }) {
  const failing = requiredChecks.filter((check) => check.conclusion !== 'success');
  if (failing.length > 0) {
    return {
      level: 'red',
      reasons: failing.map((check) => `Required check \`${check.name}\` is ${check.conclusion}.`),
    };
  }
  if (gaps.length > 0) {
    return { level: 'amber', reasons: gaps };
  }
  return {
    level: 'green',
    reasons: [
      'Every required gate passed, and every changed route and feature slice has an E2E spec ' +
        'and a PRD.',
    ],
  };
}

/** A Markdown summary of a decision, for the job summary and a reviewer. */
export function renderSummary({ level, reasons }) {
  const heading = { green: 'Green', amber: 'Amber', red: 'Red' }[level];
  return [
    `## Merge confidence: ${heading}`,
    '',
    ...reasons.map((reason) => `- ${reason}`),
    '',
  ].join('\n');
}
