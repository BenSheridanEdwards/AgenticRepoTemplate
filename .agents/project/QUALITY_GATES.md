# Quality Gates

Quality gates turn standards into commands. The rule is simple: document a gate
only when a hook, script, workflow, or review checklist actually owns it.

## Gate matrix

| Stage | Owner | Gates |
| --- | --- | --- |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. |
| Pre-commit | `.husky/pre-commit` | Branch contains origin/main (last known copy when offline), `pnpm typecheck`, staged Biome, Fallow, staged gitleaks scan. |
| Pre-push | `.husky/pre-push` | Every pushed branch contains freshly fetched origin/main, Jest coverage, production build, Playwright E2E and axe scan, then restore or publish the exact StyleProof map. |
| Local proof | `pnpm verify` + `pnpm e2e` | Context layer, typecheck, Biome, Fallow, coverage, build, size, E2E. |
| Context layer | `scripts/check-context-layer.mjs` (`pnpm check:context`) | Contract, manifest, project docs, ledgers, and house skills exist as real files. |
| CI quality | `.github/workflows/ci.yml` | PR head contains main, context layer, typecheck, Biome, Fallow, tests, build, security. |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets (median of three runs) on PRs that touch UI-relevant files; other PRs report the same check green with audits skipped. |
| CI visual | `.github/workflows/styleproof.yml` | StyleProof computed-style base/head comparison. |
| Enforcement sign-off | `.github/workflows/enforcement-approval.yml` | `enforcement-approval` status stays red until a write-access reviewer approves changes to enforcement paths. |

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
It runs only in CI and compares the PR head against the PR base commit:

- **One install, at the head.** The job installs the PR head once and fails
  closed if that install leaves `git status --porcelain` non-empty. A capture
  from a dirty tree cannot bind to a commit SHA.
- **The base is captured from the head's install.** A detached worktree of the
  base commit sits under the ignored `.styleproof/` directory, so its sources
  resolve the head's `node_modules`. `STYLEPROOF_APP_ROOT` points
  `playwright.styleproof.config.ts` at it. Nothing is installed at the base:
  an install there rewrites any tracked file the base commits with the wrong
  mode (the `vendor/extract-zip/cli.js` bin did) and dirties the capture.
  Dependency-only visual changes therefore show no diff, because both sides
  render with the head's dependencies.
- **Maps never leave the job.** Both captures pass `--no-upload`, and the
  report is a workflow artifact (`report-storage: artifact`). Nothing is
  published to the `styleproof-maps` branch from CI or from a laptop.
- **Capture is selected by test title**, not file path: StyleProof registers its
  capture tests from inside the library (attributed to `node_modules`), so
  `styleproof-map` selects them with `playwright test --grep "styleproof capture"`.
- **The approval workflow must live on the default branch.**
  [`styleproof-approve.yml`](../../.github/workflows/styleproof-approve.yml) is an
  `issue_comment` workflow, which only ever runs from the default branch — it has
  no effect while it lives only on a feature branch.
- **The gate only blocks merges once branch protection requires the `StyleProof`
  commit status.** Until a branch-protection rule requires that status, a red
  StyleProof report is advisory. Adding that rule is a post-clone setup step (see
  the README).
- **The StyleProof workflows are hand-owned.** They are adapted from the
  `styleproof-init` 7.7.0 templates (single job, artifact storage, review gate)
  with this repo's Node and pnpm setup, the worktree base capture above, and
  commit-pinned StyleProof refs, so
  `styleproof-init --upgrade` does not rewrite them. To upgrade, regenerate into
  a scratch checkout and port the diff. `styleproof.config.ts` sets
  `blocking: true`; the init default, `'advisory'`, turns the gate green.

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
- Every branch must contain the latest origin/main
  (`scripts/require-up-to-date-main.sh`). The fix is
  `git fetch origin && git merge origin/main`. This is the one networked
  pre-commit check: the fetch is quiet, capped at 10 seconds, and falls back to
  the last known origin/main when offline. Pre-push and CI require a fresh fetch.
  Pre-commit and CI check HEAD. Pre-push checks every pushed branch from git's
  pre-push stdin, whichever branch is checked out. Deletions, tags, and pushes
  to main are exempt.
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
