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

/** A changed source file in `<result>/web/src/routes/<name>/` or `.../features/<name>/`. */
const SLICE_PATH = /^((?:apps|showcase\/[^/]+))\/web\/src\/(routes|features)\/([^/]+)\//;

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
