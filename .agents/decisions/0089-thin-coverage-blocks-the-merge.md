# 89. Thin coverage blocks the merge

- **Status:** Proposed
- **Date:** 2026-10-31
- **Amends:** [Merge confidence label](0064-merge-confidence-label.md),
  [Grade merge confidence on changed-file line coverage](0067-grade-merge-confidence-on-changed-file-line-coverage.md)

## Context

Global and per-result coverage can pass while a changed source file has little
test coverage. The confidence label reported that gap as amber, so it could
reach main despite the warning. The existing coverage JSON and slice-to-spec
mapping give the required gate a deterministic measure.

## Decision

Require the `Changed-file coverage` CI lane, judged by `Required gates` and
listed in the generated gate inventory. Run it after unit tests and download
that run's `coverage-final` artifact. Missing, unreadable or malformed coverage
fails closed, including on changes outside application source.

Reuse Jest's `collectCoverageFrom` selection and
`coverageThreshold.global.lines`, currently 80%, for each changed source file.
Keep the existing Istanbul line calculation and skip deleted sources. A changed
route or feature slice with no E2E spec naming it in its own result also blocks.
The spec-name mapping proves a slice has a behaviour map entry; it does not
measure browser line coverage.

Run the same gate through `pnpm coverage:changed` after `pnpm test:coverage` in
`verify`. Coverage and slice gaps grade the confidence label red. PRD and import
blast-radius gaps remain amber. Keep label names, colours and Jest thresholds.

There is no human override. The only threshold-change path is a reviewed change
to `jest.config.ts`. Ben's non-blocking Q7, "coverage override", in the Phase J
cleanup plan asks whether to add an override and guard that config. It remains
an open question in [Make changed-file coverage a required gate](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/issues/234).
This decision adds neither an override nor a new guarded path.

## Consequences

A green aggregate now requires changed-file unit coverage and slice E2E mapping.
Authors close gaps with tests before merging. The greeting schema's encode
round-trip test covers its previously uncovered transform without changing the
application. No dependency or runtime behaviour changes.

CLI tests prove low coverage, missing specs and unavailable JSON fail, and full
coverage passes. Contract tests prove the lane is required and cannot disappear
from the workflow or inventory unnoticed.
