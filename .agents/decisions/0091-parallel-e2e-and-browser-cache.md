# 91. Run E2E in parallel and cache Chromium

- **Status:** Proposed
- **Date:** 2026-11-01
- **Supersedes:** [0065](0065-e2e-waits-for-unit-tests.md)

## Context

Unit tests take about 269 seconds and E2E takes about 57 seconds on hosted
runners. Serial execution extends the time to required checks passing.
Chromium installation takes about 24 seconds in each browser lane.

## Decision

Run E2E independently of unit tests. Keep both lanes in Required gates.
Use GitHub's first-party actions/cache v6.1.0, pinned to its commit, in E2E
and visual regression. Key the browser cache by runner OS and the exact
Playwright version in the lockfile. Install OS dependencies on a cache hit;
install Chromium and its dependencies on a miss.

Keep the PR validator dependency installation: its imported
check-prd-conflicts.mjs imports typescript. Keep full checkout history for
the base/head merge-base diff and the last North Star commit lookup.

## Consequences

Failed unit tests still incur E2E execution. Successful lanes overlap.
Browser downloads can be reused while OS packages are installed each run.
Required checks and enforcement approval continue to apply.
