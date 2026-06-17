# 2. Quality gates are code, enforced locally and in CI

- **Status:** Accepted
- **Date:** 2026-06-17

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
- **Pre-push (behaviour):** unit/component tests, end-to-end behaviour map.
- **CI:** all of the above re-run on a clean checkout, plus dependency + secret
  security audit and the StyleProof visual gate.

The local hooks and CI run the *same* checks, so "passes on my machine" and
"passes in CI" converge. `pnpm verify` is the single local command that mirrors
the gate suite.

## Consequences

- Non-conforming code cannot reach `main`, whoever or whatever wrote it.
- The Definition of Done is executable, not aspirational.
- Hooks add seconds to the commit loop; we keep pre-commit fast and staged-only,
  and push the slower suites to pre-push and CI to protect that loop.
- Hooks can be bypassed with `--no-verify`; CI cannot. CI is the backstop.
