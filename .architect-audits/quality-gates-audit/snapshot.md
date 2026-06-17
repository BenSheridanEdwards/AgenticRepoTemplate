# Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `f4c862b97f79738bbe04483f2d1f2f494f77037e`
- Ecosystem: node
- Package manager: pnpm (`pnpm@11.3.0`, `pnpm-lock.yaml`)
- Hook runner: husky (`.husky/` + `prepare: husky`)
- Graphify output present: yes (graph-enriched; revision `2026-06-17T21:27:26Z`)
- Generated: 2026-06-17T12:00:00Z

## Posture in one line

A genuinely strong, security-hardened quality-gate posture for a frontend
template. Pre-commit now adds a staged secret scan, pre-push now runs build
smoke + coverage tests, and CI gained bundle-size, accessibility, Lighthouse,
CodeQL SAST and Dependabot. The only material gaps left are deliberate design
choices (Biome's native `--staged` instead of `lint-staged`, type-check/lint
owned by pre-commit + CI rather than re-run on pre-push) plus one true absence:
no license-compliance check.

## Status tally

| Stage | Present | Misconfigured | Missing |
| --- | --- | --- | --- |
| Pre-commit | 3 | 3 | 0 |
| Pre-push | 3 | 0 | 2 |
| Continuous integration | 8 | 0 | 1 |

## What is solid

- Husky wired for commit-msg, pre-commit, pre-push.
- Conventional Commits enforced via commitlint on commit-msg.
- Staged secret scan (gitleaks protect --staged) on pre-commit, with an
  unconditional gitleaks backstop in CI.
- Pre-push behaviour net: coverage tests, Vite build smoke, Playwright E2E.
- CI superset: fresh-checkout typecheck, whole-repo lint, coverage threshold
  (80%), E2E, bundle-size budget, three-layer accessibility, dependency audit
  + Dependabot, Lighthouse budgets, CodeQL SAST.

## What is graded short of present (and why)

- Staged formatter / linter — misconfigured: `biome check --staged` directly,
  no `lint-staged` block (deliberate; Biome's native --staged supersedes it).
- Type check on staged files — misconfigured: full-project `tsc --noEmit` on
  pre-commit, not staged-scoped.
- Pre-push full type check / full lint — missing at this stage: owned by
  pre-commit + CI by design, not re-run on pre-push.
- License-compliance check — missing: genuinely absent, no tooling.
