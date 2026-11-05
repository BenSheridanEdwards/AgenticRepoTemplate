# 117. Fill CI caches from main on every key change

- **Status:** Proposed
- **Date:** 2026-11-03
- **Amends:** [0106](0106-ci-caches-save-only-from-manual-main-runs.md), [0091](0091-parallel-e2e-and-browser-cache.md)

## Context

ADR 0106 let only a hand-started main run save the pnpm store. On 3 November
2026 nobody had started one, so every pull request job restored nothing and
installed cold: `pnpm store: miss` in each installing lane, about 17 s of setup.
GitHub scopes a PR's cache to that PR, so only a main run can fill a cache
other PRs read.

Three workflows (Lighthouse, Visual regression, PR quality) still used
`setup-node` `cache: pnpm`, and the E2E and visual jobs used `actions/cache`,
which saves after every PR run. Those per-PR entries (24 pnpm caches of 223 MB
and 16 browser caches of 273 MB) had pushed the repository to 10.9 GB, over
GitHub's 10 GB limit, so GitHub evicted entries every hour.

## Decision

Pull request runs restore caches and never save them. Every dependency-install
lane, including Lighthouse, Visual regression and PR quality, uses the shared
setup composite. The E2E and visual browser caches use `actions/cache/restore`.

A `Fill caches from main` workflow runs on a push to main that changes
`pnpm-lock.yaml`, `.nvmrc` or the setup composite, and on manual dispatch. It
saves the pnpm store through the composite and the Chromium download through
`actions/cache/save`. The composite's save condition admits `push` beside
`workflow_dispatch`, still only on `refs/heads/main` with explicit opt-in and
no exact hit. A push to main runs merged, reviewed code, so it is as trusted
as the manual run ADR 0106 allowed. `scripts/playwright-version.mjs` reads the
browser cache key's Playwright version for every workflow.

## Consequences

A merged lockfile change refills both caches within minutes; a PR that changes
the lockfile restores the closest main store and installs the difference. Cache
storage holds one entry per key instead of one per pull request. The manual
`save_pnpm_cache` dispatch from ADR 0106 stays for an immediate refill.
