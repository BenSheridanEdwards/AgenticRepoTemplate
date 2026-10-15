# Quality Gates

Quality gates turn standards into commands. The rule is simple: document a gate
only when a hook, script, workflow, or review checklist actually owns it.

## Gate matrix

| Stage | Owner | Gates |
| --- | --- | --- |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. |
| Pre-commit | `.husky/pre-commit` | `pnpm typecheck`, staged Biome, Fallow, staged gitleaks scan. |
| Pre-push | `.husky/pre-push` | Jest coverage, production build, Playwright E2E and axe scan, then restore or publish the exact StyleProof map. |
| Local proof | `pnpm verify` + `pnpm e2e` | Context layer, typecheck, Biome, ESLint policy lint, React Doctor, Fallow, coverage, build, size, E2E. |
| Context layer | `scripts/check-context-layer.mjs` (`pnpm check:context`) | Contract, manifest, project docs, ledgers, and house skills exist as real files. |
| CI quality | `.github/workflows/ci.yml` | Context layer, typecheck, Biome, ESLint policy lint, React Doctor, Fallow, tests, build, security. |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets. |
| CI visual | `.github/workflows/styleproof.yml` | StyleProof computed-style base/head comparison. |
| Enforcement sign-off | `.github/workflows/enforcement-approval.yml` | `enforcement-approval` status stays red until a write-access reviewer approves changes to enforcement paths. |

## Tool ownership

- **Biome** owns formatting, import ordering, and general JavaScript/TypeScript
  lint.
- **ESLint** (`pnpm lint:policy`) owns policy rules, React hooks rules, React
  Compiler rules, and React Doctor rules through `eslint-plugin-react-doctor`.
- **React Doctor** (`pnpm react-doctor`) owns the project-level checks the
  ESLint plugin cannot express, such as duplicated JSX across files.
- **TypeScript** owns type semantics through `tsc --noEmit`.
- **Jest + React Testing Library** own component and hook behaviour.
- **jest-axe, @axe-core/playwright, and Lighthouse** own accessibility.
- **Playwright** owns user-visible behaviour through the E2E map.
- **Fallow** owns dead code, circular dependencies, complexity, and architecture
  drift.
- **StyleProof** owns computed-style visual regressions.
- **CodeQL, gitleaks, pnpm audit, and the license check** own security and
  dependency risk.

Each lint rule has exactly one owner
([ADR 0010](../decisions/0010-lint-engine-ownership.md),
[ADR 0015](../decisions/0015-eslint-policy-stack-wiring.md)). Biome runs the fast
format, import, and general lint loop; ESLint and React Doctor run the React
policy layer; the remaining concerns sit with stronger gates at the layer where
the behaviour is observable.

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
- **Exact commit maps are reused.** Pre-push restores an existing SHA-keyed map
  before capturing; CI captures only a missing head when the base is compatible,
  and publishes every cold fallback for later runs.

## Enforcement approval

[`enforcement-approval.yml`](../../.github/workflows/enforcement-approval.yml)
applies [ADR 0007](../decisions/0007-protect-enforcement-paths-by-default.md):
changes to the files that define the gates wait for a maintainer's sign-off.

- **Protected areas**, checked in order by
  [`scripts/enforcement-approval.mjs`](../../scripts/enforcement-approval.mjs):
  `pnpm-lock.yaml`; agent docs (`AGENTS.md`, `CLAUDE.md`, `GUARDRAILS.md`,
  `.agents/**`, `agents/**`); `.github/**`; `.claude/**`; `.husky/**`;
  `scripts/**`; `tooling/**`; and every root file outside a short prose and app
  allowlist (`README.md`, `LICENSE`, `index.html`, and similar). A rename counts
  when either side is protected.
- **One sticky comment** lists the protected files with a single
  `Approve these enforcement changes` box. Ticking it, with write access, turns
  the `enforcement-approval` commit status green. Any later change to a
  protected file resets the box; changes elsewhere keep the approval.
- **Main's copy judges the PR.** The workflow uses `pull_request_target`,
  checks out only the default branch's script, and reads the PR's files through
  the API, so it takes effect once it lands on main. Require the
  `enforcement-approval` status in branch protection to make it blocking.
- **Dry run** against any PR:
  `gh api --paginate repos/OWNER/REPO/pulls/N/files | jq -s '{files: add}' | node scripts/enforcement-approval.mjs`.

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
