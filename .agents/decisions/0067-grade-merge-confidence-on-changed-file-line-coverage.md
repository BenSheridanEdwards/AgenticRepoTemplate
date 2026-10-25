# 67. Grade merge confidence on changed-file line coverage

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-25
- **Builds on:** [0064](0064-merge-confidence-label.md),
  [0017](0017-required-gates-aggregate.md)

## Context

Passing aggregate coverage and the per-result thresholds in
`tooling/coverage-by-result.mjs` can hide one weak changed source file.
ADR 0064 deferred a coverage-drop signal until a deterministic measure existed.
Istanbul's per-file `coverage-final.json` supplies that measure for issue #137.
Sarah Fim's [video](https://x.com/sarahfim/status/2108298553823203613) and
[write-up](https://x.com/sarahfim/status/2109736893198016898) motivate a factory
that gives reviewers explicit evidence and names the gaps.

## Decision

Upload `coverage/coverage-final.json` from the CI test job as `coverage-final`
with `if: always()` and seven-day retention. Keep the existing failure upload.
Treat coverage as PR-produced evidence that can influence only the advisory
label; keep the required gates as the merge bar, with every threshold intact.

Select changed source files with the trusted `jest.config.ts`
`collectCoverageFrom` globs, including their exclusions. Read the threshold
from `coverageThreshold.global.lines`, so neither selection nor threshold has
a second owner. Skip deleted files by checking existence in the PR checkout.

Validate the JSON as a nonempty map of file entries with paths, statement maps
and nonnegative integer counts. Require positive integer statement start lines.
Compute Istanbul line coverage by grouping statements by start line and taking
the highest count on each line. Count positive lines as covered and floor the
percentage to two decimal places; a file with no statements is 100% covered.
Match each changed repository path against the absolute entry path's suffix.

Report an amber gap for every changed source below the threshold, naming its
path and percentage. Report a gap for a source absent from valid coverage.
Fail closed to red with `coverage unavailable` when the artifact is absent,
unreadable, empty or malformed, alongside any required-check failures.
Preserve every existing grading rule.

Grant the privileged confidence job `actions: read` to find the head's CI run
and download its artifact. Read coverage as JSON data only. Execute the trusted
default-branch script and import only its Jest config; never execute PR code or
run PR tests in this workflow. Handle lookup or download failure by grading
coverage unavailable.

## Consequences

The label remains advisory. A cancelled CI run or an artifact past its seven-day
retention grades red until CI reruns with usable coverage. This workflow change
only activates on main, so this PR cannot exercise its new hosted grading path;
CLI behaviour tests and local dry-runs prove the decision before landing.

## Alternatives rejected

- Hard-code globs or 80: this duplicates Jest's coverage contract.
- Run Jest in the privileged workflow: this executes untrusted PR code.
- Add `coverage-summary.json`: this duplicates artifact data and still uses
  absolute paths.
- Treat missing coverage as amber: this does not fail closed.
