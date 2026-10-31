#!/usr/bin/env node
/**
 * The merge-confidence label: how much a reviewer can trust a green pull
 * request. CI grades every PR `confidence: green`, `confidence: amber` or
 * `confidence: red` from five inputs (issues #69/#137/#138, ADRs 0064/0067/0068):
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
 * - **Unit line coverage.** Each changed source meets Jest's line threshold.
 * - **Import blast radius.** Fallow importers stay within one unit and the count threshold.
 *
 * Coverage gaps grade `red` and fail the Changed-file coverage lane. PRD and
 * import blast-radius gaps grade `amber`; a PR with no gaps grades `green`.
 *
 * CLI modes:
 *   --decide   Grade the PR. Reads `CHECK_RUNS` (the head commit's check runs as
 *              JSON), `CHANGED` (one file per line), and CI JSON from
 *              `COVERAGE_FILE` and `BLAST_RADIUS_FILE` (matched to `HEAD_SHA`).
 *              Reads specs and PRDs as text from `PR_ROOT`
 *              (default: cwd), prints the level and reasons, and writes
 *              `level` and `label` to `GITHUB_OUTPUT` and a summary to
 *              `GITHUB_STEP_SUMMARY`.
 *   --coverage-gate  Check CHANGED sources and slices against COVERAGE_FILE and
 *                    specs in PR_ROOT (default: cwd). Exit 1 on gaps or missing coverage.
 *   --labels   Print the three label definitions (name, colour, description) as
 *              JSON, so the workflow can create any that the repository lacks.
 */

import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { matchesGlob, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../jest.config.ts';
import { blastRadiusGaps, parseBlastRadius, renderBlastRadius } from './blast-radius.mjs';
import { AGGREGATE, REQUIRED_GATES } from './required-gates.mjs';

const SPEC_GLOB = '**/web/e2e/**/*.spec.ts';
const PRD_GLOB = 'docs/prd/*.md';

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
    description:
      'Required gates, slice E2E/PRDs, unit line coverage and import blast radius passed.',
  },
  amber: {
    name: CONFIDENCE_LABELS.amber,
    color: 'dbab09',
    description:
      'Required gates passed, with an E2E, PRD, unit coverage or import blast-radius gap.',
  },
  red: {
    name: CONFIDENCE_LABELS.red,
    color: 'd73a49',
    description: 'A required gate is failing or pending, or evidence is unavailable.',
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
  const slices = new Map(
    changedFiles
      .map(sliceOf)
      .filter(Boolean)
      .map((slice) => [`${slice.result}:${slice.kind}:${slice.name}`, slice]),
  );
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

export const coverageThreshold = () => config.coverageThreshold.global.lines;

export function isCoveredSource(path) {
  const patterns = config.collectCoverageFrom;
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((p) => p.slice(1));
  return (
    included.some((pattern) => matchesGlob(path, pattern)) &&
    !excluded.some((pattern) => matchesGlob(path, pattern))
  );
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validFileCoverage = (entry) =>
  isObject(entry) &&
  typeof entry.path === 'string' &&
  isObject(entry.statementMap) &&
  isObject(entry.s) &&
  Object.entries(entry.statementMap).every(
    ([id, statement]) =>
      Number.isInteger(statement?.start?.line) &&
      statement.start.line > 0 &&
      Number.isInteger(entry.s[id]) &&
      entry.s[id] >= 0,
  );

export function parseCoverage(text) {
  try {
    const coverage = JSON.parse(text);
    return isObject(coverage) &&
      Object.keys(coverage).length > 0 &&
      Object.values(coverage).every(validFileCoverage)
      ? coverage
      : undefined;
  } catch {
    return undefined;
  }
}

export function lineCoverage({ statementMap, s }) {
  const lines = Object.groupBy(
    Object.entries(statementMap),
    ([, statement]) => statement.start.line,
  );
  const counts = Object.values(lines).map((statements) =>
    Math.max(...statements.map(([id]) => s[id])),
  );
  return counts.length === 0
    ? 100
    : Math.floor((counts.filter((count) => count > 0).length / counts.length) * 10000) / 100;
}

export function lineCoverageGaps(changedSources, coverage) {
  const entries = Object.values(coverage);
  return changedSources.flatMap((file) => {
    const entry = entries.find((candidate) => candidate.path.endsWith(`/${file}`));
    if (!entry) {
      return [
        `The changed source \`${file}\` has no entry in the CI coverage. Add a unit test that imports it.`,
      ];
    }
    const percent = lineCoverage(entry);
    return percent < coverageThreshold()
      ? [
          `The changed source \`${file}\` has ${percent}% line coverage, below the ${coverageThreshold()}% threshold. Add unit tests that exercise it.`,
        ]
      : [];
  });
}

function readCoverage() {
  try {
    return parseCoverage(readFileSync(process.env.COVERAGE_FILE, 'utf8'));
  } catch {
    return undefined;
  }
}

function readBlastRadius(changed) {
  try {
    const path = process.env.BLAST_RADIUS_FILE;
    const limit = 5 * 1024 * 1024;
    if (!path || statSync(path).size > limit) return undefined;
    const text = readFileSync(path, 'utf8');
    return Buffer.byteLength(text) <= limit
      ? parseBlastRadius(text, { head: process.env.HEAD_SHA, changed })
      : undefined;
  } catch {
    return undefined;
  }
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
 * Grade coverage gaps, missing evidence and failed checks red; PRD and import
 * gaps amber; no gaps green. Pure.
 *
 * @param {{ requiredChecks: { name: string, conclusion: string }[], gaps: string[], blockingGaps?: string[], coverageUnavailable?: boolean, blastRadiusUnavailable?: boolean }} input
 */
export function decideConfidence({
  requiredChecks,
  gaps,
  blockingGaps = [],
  coverageUnavailable = false,
  blastRadiusUnavailable = false,
}) {
  const failing = requiredChecks.filter((check) => check.conclusion !== 'success');
  if (
    failing.length > 0 ||
    blockingGaps.length > 0 ||
    coverageUnavailable ||
    blastRadiusUnavailable
  ) {
    return {
      level: 'red',
      reasons: [
        ...blockingGaps,
        ...gaps,
        ...failing.map((check) => `Required check \`${check.name}\` is ${check.conclusion}.`),
        ...(coverageUnavailable
          ? ["The head's CI coverage artifact is missing or malformed: `coverage unavailable`."]
          : []),
        ...(blastRadiusUnavailable
          ? ['Blast-radius evidence is missing or invalid: `blast radius unavailable`.']
          : []),
      ],
    };
  }
  if (gaps.length > 0) {
    return { level: 'amber', reasons: gaps };
  }
  return {
    level: 'green',
    reasons: [
      'Every required gate passed, and every changed route and feature slice has an E2E spec ' +
        'and a PRD, and every changed source file meets the line-coverage threshold. ' +
        'Import blast radius stays within its unit and count threshold.',
    ],
  };
}

/** A Markdown summary of a decision, for the job summary and a reviewer. */
export function renderSummary({ level, reasons, details = [] }) {
  const heading = { green: 'Green', amber: 'Amber', red: 'Red' }[level];
  return [
    `## Merge confidence: ${heading}`,
    '',
    ...reasons.map((reason) => `- ${reason}`),
    '',
    ...details,
  ].join('\n');
}

/** Read only spec and PRD text from the PR checkout; execute no code from it. */
function createNodeFilesystem(rootDirectory) {
  if (!existsSync(rootDirectory) || !statSync(rootDirectory).isDirectory()) {
    throw new Error('PR_ROOT must name an existing directory.');
  }
  const walk = (directory) =>
    existsSync(resolve(rootDirectory, directory))
      ? readdirSync(resolve(rootDirectory, directory), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => relative(rootDirectory, resolve(entry.parentPath, entry.name)))
      : [];
  const showcase = resolve(rootDirectory, 'showcase');
  const results = existsSync(showcase)
    ? readdirSync(showcase, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `showcase/${entry.name}/web/e2e`)
    : [];
  return {
    listFiles: () => ['docs/prd', 'apps/web/e2e', ...results].flatMap(walk),
    readText: (path) => readFileSync(resolve(rootDirectory, path), 'utf8'),
  };
}

function readJsonEnv(name) {
  let value;
  try {
    value = JSON.parse(process.env[name] ?? '');
  } catch {
    throw new Error(`${name} must be set to a valid JSON array.`);
  }
  if (!Array.isArray(value)) throw new Error(`${name} must be set to a valid JSON array.`);
  return value;
}

/** Write `key=value` to `GITHUB_OUTPUT` when the workflow set it. */
function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function runDecide() {
  const checkRuns = readJsonEnv('CHECK_RUNS');
  const changed = (process.env.CHANGED ?? '').split('\n').filter(Boolean);
  const root = resolve(process.env.PR_ROOT ?? process.cwd());
  const filesystem = createNodeFilesystem(root);
  const coverage = readCoverage();
  const evidence = readBlastRadius(changed);
  const blastRadius = evidence ? blastRadiusGaps(evidence) : { gaps: [], summary: undefined };
  const sources = changed.filter(
    (file) => isCoveredSource(file) && existsSync(resolve(root, file)),
  );
  const candidates = filesystem.listFiles();
  const read = (glob) =>
    candidates
      .filter((path) => matchesGlob(path, glob))
      .map((path) => ({ path, text: filesystem.readText(path) }));
  const slices = collectSlices(changed);
  const blockingGaps = [
    ...coverageGaps(slices, read(SPEC_GLOB)),
    ...(coverage ? lineCoverageGaps(sources, coverage) : []),
  ];
  const decision = decideConfidence({
    requiredChecks: requiredCheckResults(checkRuns),
    gaps: [...prdGaps(slices, read(PRD_GLOB)), ...blastRadius.gaps],
    blockingGaps,
    coverageUnavailable: !coverage,
    blastRadiusUnavailable: !evidence,
  });

  console.log(`confidence: ${decision.level}`);
  decision.reasons.forEach((reason) => {
    console.log(`  - ${reason}`);
  });
  writeOutput('level', decision.level);
  writeOutput('label', CONFIDENCE_LABELS[decision.level]);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      renderSummary({
        ...decision,
        details: blastRadius.summary ? renderBlastRadius(blastRadius.summary) : [],
      }),
    );
  }
}

function runCoverageGate() {
  const changed = (process.env.CHANGED ?? '').split('\n').filter(Boolean);
  const root = resolve(process.env.PR_ROOT ?? process.cwd());
  const filesystem = createNodeFilesystem(root);
  const coverage = readCoverage();
  if (!coverage) {
    console.error('coverage unavailable: COVERAGE_FILE must contain valid coverage JSON.');
    process.exitCode = 1;
    return;
  }
  const sources = changed.filter(
    (file) => isCoveredSource(file) && existsSync(resolve(root, file)),
  );
  const specs = filesystem
    .listFiles()
    .filter((path) => matchesGlob(path, SPEC_GLOB))
    .map((path) => ({ path, text: filesystem.readText(path) }));
  const gaps = [
    ...lineCoverageGaps(sources, coverage),
    ...coverageGaps(collectSlices(changed), specs),
  ];
  if (gaps.length > 0) {
    gaps.forEach((gap) => {
      console.error(gap);
    });
    process.exitCode = 1;
  } else {
    console.log('Changed-file coverage passed.');
  }
}

function runCli(mode) {
  if (mode === '--decide') {
    runDecide();
  } else if (mode === '--coverage-gate') {
    runCoverageGate();
  } else if (mode === '--labels') {
    console.log(JSON.stringify(Object.values(CONFIDENCE_LABEL_DEFS)));
  } else {
    console.error('Usage: confidence-label.mjs --decide | --coverage-gate | --labels');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv[2]);
}
