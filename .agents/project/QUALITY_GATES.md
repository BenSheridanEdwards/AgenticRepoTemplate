# Quality Gates

Quality gates turn standards into commands. The rule is simple: document a gate
only when a hook, script, workflow, or review checklist actually owns it.

## Gate matrix

| Stage | Owner | Gates |
| --- | --- | --- |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. |
| Pre-commit | `.husky/pre-commit` | `pnpm typecheck`, staged Biome, Fallow, staged gitleaks scan. |
| Pre-push | `.husky/pre-push` | Jest coverage, production build, Playwright E2E and axe scan. |
| Local proof | `pnpm verify` + `pnpm e2e` | Typecheck, Biome, Fallow, coverage, build, size, E2E. |
| CI quality | `.github/workflows/ci.yml` | Typecheck, Biome, Fallow, tests, build, security. |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets. |
| CI visual | `.github/workflows/styleproof.yml` | StyleProof computed-style base/head comparison. |

## Tool ownership

- **Biome** owns formatting, import ordering, and JavaScript/TypeScript lint
  rules that it implements.
- **TypeScript** owns type semantics through `tsc --noEmit`.
- **Jest + React Testing Library** own component and hook behaviour.
- **jest-axe, @axe-core/playwright, and Lighthouse** own accessibility.
- **Playwright** owns user-visible behaviour through the E2E map.
- **Fallow** owns dead code, circular dependencies, complexity, and architecture
  drift.
- **StyleProof** owns computed-style visual regressions.
- **CodeQL, gitleaks, pnpm audit, and the license check** own security and
  dependency risk.

This is why the template does not add ESLint or Prettier. Biome covers the fast
lint/format/import loop; the remaining concerns are covered by stronger gates at
the layer where the behaviour is observable.

## StyleProof operating notes

StyleProof is the computed-style visual gate
([`.github/workflows/styleproof.yml`](../../.github/workflows/styleproof.yml)).
It is runnable locally, not CI-only:

- `pnpm styleproof:capture` captures a baseline (`STYLEMAP_DIR=base`) and
  `pnpm styleproof:diff` captures the head and diffs it against that baseline.
- **Capture is selected by test title**, not file path: StyleProof registers its
  capture tests from inside the library (attributed to `node_modules`), so both
  scripts select them with `playwright test --grep "styleproof capture"`.
- **`STYLEPROOF_REPLAY_FROM` isolates data drift.** `styleproof:diff` replays the
  base run's recorded data (`STYLEPROOF_REPLAY_FROM=__stylemaps__/base`) so the
  diff is *code*, not live-data drift.
- **The approval workflow must live on the default branch.**
  [`styleproof-approve.yml`](../../.github/workflows/styleproof-approve.yml) is an
  `issue_comment` workflow, which only ever runs from the default branch — it has
  no effect while it lives only on a feature branch.
- **The gate only blocks merges once branch protection requires the `StyleProof`
  commit status.** Until a branch-protection rule requires that status, a red
  StyleProof report is advisory. Adding that rule is a post-clone setup step (see
  the README).

## Placement rules

- Put the fastest deterministic checks in pre-commit.
- Put expensive behaviour checks in pre-push and CI.
- Run security and dependency checks in CI, with staged secret scanning locally.
- Keep CI as the clean-checkout backstop. Local hooks can be bypassed; CI cannot.
- If a hook runs tests that create or inspect other Git repos, clear Git-local
  hook variables first: `unset $(git rev-parse --local-env-vars)`.
- If a check mutates files, it must be explicit and reviewable. Gates should
  prefer failing with instructions over silently rewriting unrelated files.

## When changing gates

1. Update the hook, script, or workflow.
2. Update this matrix and the Definition of Done if the meaning of "done"
   changes.
3. Add an ADR when adding, removing, or swapping a tool owner.
4. Run the changed gate directly, then `pnpm verify` and `pnpm e2e`.
