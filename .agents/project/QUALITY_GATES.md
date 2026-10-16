# Quality Gates

Quality gates turn standards into commands. The rule is simple: document a gate
only when a hook, script, workflow, or review checklist actually owns it.

## Gate matrix

| Stage | Owner | Gates |
| --- | --- | --- |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. |
| Pre-commit | `.husky/pre-commit` | Branch contains origin/main (last known copy when offline), `pnpm typecheck`, staged Biome, Fallow, staged gitleaks scan. |
| Pre-push | `.husky/pre-push` | Every pushed branch contains freshly fetched origin/main, Jest coverage, production build, Playwright E2E and axe scan. |
| Local proof | `pnpm verify` + `pnpm e2e` | Context layer, typecheck, Biome, Fallow, coverage, build, size, E2E. |
| Context layer | `scripts/check-context-layer.mjs` (`pnpm check:context`) | Contract, manifest, project docs, ledgers, and house skills exist as real files. |
| CI quality | `.github/workflows/ci.yml` | PR head contains main, context layer, typecheck, Biome, Fallow, tests, build, security. |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets (median of three runs) on PRs that touch UI-relevant files; other PRs report the same check green with audits skipped. |
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
- **CodeQL, gitleaks, pnpm audit, and the license check** own security and
  dependency risk.

This is why the template does not add ESLint or Prettier. Biome covers the fast
lint/format/import loop; the remaining concerns are covered by stronger gates at
the layer where the behaviour is observable.

## Visual style checking

Visual style checking returns once StyleProof is fixed
([ADR 0015](../decisions/0015-pause-styleproof-until-it-is-fixed.md)).

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
