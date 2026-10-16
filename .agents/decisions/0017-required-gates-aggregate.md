# 17. One fail-closed required-gate contract

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Branch protection on `main` lists nine required checks, and only repository
settings record that list. GitHub counts a job skipped by `if:` as a passing
required check. A job with `continue-on-error: true` also reports success when
it fails. So an edit to a workflow can stop a lane from running while its
required check stays green. Renaming a job orphans its required context. No
gate noticed either change.

## Decision

- **`scripts/required-gates.mjs` is the contract.** One table lists every
  required check with its workflow, job id, and who judges it.
- **`Required gates` is the stable final result.** The aggregate job in
  `ci.yml` needs every `ci.yml` lane and runs with `if: always()`. A lane
  passes only on `success`. A skip passes only where the lane's declared
  applicability rule says it does not apply. `Branch contains main` is the one
  such lane: it applies to pull requests into `main`. Missing, failed,
  cancelled, and any other skipped result fail.
- **CodeQL, Lighthouse, and the PR body check stay required directly.** They
  run on triggers `ci.yml` does not share: a weekly schedule, pull requests
  only, and body edits. The contract pins their job names and job-level `if:`.
- **Freshness is a gate.** `pnpm gates:check` fails when a contract job is
  missing or renamed, a job-level `if:` differs from the contract, a gate job
  sets `continue-on-error`, a `ci.yml` job is outside the contract, the
  aggregate job's text differs from the one the contract renders, or
  `docs/required-gates.md` is stale. It runs in `pnpm verify` and in the
  aggregate job. Steps inside lane jobs stay with enforcement approval.
- **Settings stay with a maintainer.** The contract names the checks to
  require. `node scripts/required-gates.mjs --protection` compares the live
  settings with them.

## Consequences

- One required check, `Required gates`, can replace the six `ci.yml` contexts
  once a maintainer selects it. Until then it reports but does not block.
- Adding a `ci.yml` job means adding a contract row, which regenerates the
  inventory.
- Lighthouse still decides inside a step whether to audit. That rule is
  documented in the inventory but not yet tested.
