# 65. The E2E lane starts only after unit tests pass

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-25
- **Builds on:** [0017](0017-required-gates-aggregate.md)

## Context

E2E currently runs in parallel with unit and component tests. A red unit-test
run still pays for the Playwright install and browser suite, and agents can
receive the more expensive failure before resolving the cheaper one.

The [North Star](../NORTH_STAR.md) calls for executable standards and a fast
feedback loop that works consistently across agents and harnesses. Sarah Fim's
[video](https://x.com/sarahfim/status/2108298553823203613) and
[anti-slop write-up](https://x.com/sarahfim/status/2109736893198016898) motivate
that software-factory approach. Issue #140 applies it to CI feedback order.

## Decision

The `e2e` job in `.github/workflows/ci.yml` sets `needs: [test]`. Its default
success condition starts the lane only after unit and component tests pass.
The job has no explicit `if:` condition.

`Required gates` still needs every lane and runs with `if: always()`. When
unit tests fail and E2E is skipped, it names both results, judges E2E as
"skipped although it applies to this run", and fails closed. The contract in
`scripts/required-gates.mjs` and its generated inventory stay unchanged.

`scripts/required-gates.test.ts` checks the committed workflow's dependency
and absence of a job condition, and drives the real `--decide` CLI with failed
unit tests and skipped E2E to prove the aggregate rejects both results.

## Consequences

This trades off against [North Star §7 Fast CI](../NORTH_STAR.md#7-fast-ci):
a green run's wall clock grows by roughly the unit-test job's duration when
E2E is on the critical path, because the jobs no longer overlap. A red
unit-test run saves the Playwright installation and browser execution.

Local pre-push order stays the same: `pnpm verify` already runs unit tests
before `pnpm e2e`. Local and CI feedback order now match. Every gate command,
rule, threshold and approval requirement stays in place, including the
enforcement sign-off for this workflow edit.
