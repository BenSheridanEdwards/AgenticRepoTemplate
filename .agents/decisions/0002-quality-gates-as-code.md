# 2. Quality gates are code, enforced locally and in CI

- **Status:** Accepted, amended by [0028](0028-pre-push-runs-the-full-local-gate-suite.md) and [0062](0062-pre-commit-steps-stay-under-30-seconds.md)
- **Date:** 2026-06-17

- **Superseded in part by:** [ADR 0073](0073-adopt-the-typescript-toolchain-standard.md)
  for Biome lint ownership; implementation follows in separate PRs.

## Context

When standards live only in a style guide or a reviewer's head, they are applied
inconsistently — and an agent producing dozens of changes will outpace any
human's ability to police them by hand. Standards that are not mechanically
enforced are, in practice, optional.

## Decision

Every standard we care about is expressed as an executable gate, run at the
earliest point it can fail:

- **Pre-commit (fast, staged):** typecheck, Biome (lint + format + imports),
  Fallow code intelligence.
- **Commit-msg:** commitlint (Conventional Commits).
- **Pre-push (behaviour):** unit/component tests with coverage, a production
  build smoke, and the end-to-end behaviour map.
- **CI:** all of the above re-run on a clean checkout, plus dependency + secret
  security audit.

The local hooks and CI run the *same* checks, so "passes on my machine" and
"passes in CI" converge. `pnpm verify` is the single local command that mirrors
the gate suite.

## Consequences

- Non-conforming code cannot reach `main`, whoever or whatever wrote it.
- The Definition of Done is executable, not aspirational.
- Hooks add seconds to the commit loop; we keep pre-commit fast and staged-only,
  and push the slower suites to pre-push and CI to protect that loop.
- Hooks can be bypassed with `--no-verify`; CI cannot. CI is the backstop.

## Current hook scope (ADR 0062)

[0062](0062-pre-commit-steps-stay-under-30-seconds.md) supersedes the
staged-only description above: typecheck covers the project, Fallow audit
covers touched files against its base, and Biome and gitleaks cover staged
content. Each pre-commit step must finish in under 30 seconds; review examines
slower checks for a likely move to pre-push. The up-to-date-with-main check
runs at push, before the full `pnpm verify` suite and `pnpm e2e`.

## Visual regression (ADR 0052)

`pnpm visual` compares approved reference screenshots in CI on UI-relevant
pull requests; [0052](0052-playwright-visual-regression.md) records the fallback.
