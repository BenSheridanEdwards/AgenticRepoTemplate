# Quality gates audit report

Graph-enriched audit (graphify output present — full context). Static-only
inspection: no gate was executed, every status is resolved from files on disk
against the opinionated three-stage baseline.

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `f4c862b97f79738bbe04483f2d1f2f494f77037e`
- Ecosystem: node · Package manager: pnpm · Hook runner: husky
- Skill version: 1.0.0
- Run: 2026-06-17T12:00:00Z
- Graphify revision: `2026-06-17T21:27:26Z`

## Status tally

| Stage | Present | Misconfigured | Missing |
| --- | --- | --- | --- |
| Pre-commit | 3 | 3 | 0 |
| Pre-push | 3 | 0 | 2 |
| Continuous integration | 8 | 0 | 1 |

---

## Stage 1 — Pre-commit

### hook-runner-installed — present
Husky is installed and active.
- Evidence: `.husky/` with `commit-msg`, `pre-commit`, `pre-push`; `package.json` `prepare: husky`; `husky@^9.1.7`.

### staged-file-formatter — misconfigured
Biome formats staged files, but via `biome check --staged`, not `lint-staged`.
- Evidence: `@biomejs/biome@^1.9.4`; `biome.json` `formatter.enabled = true`; `.husky/pre-commit:12` runs `pnpm exec biome check --staged --no-errors-on-unmatched .`; no `lint-staged` block / `.lintstagedrc` anywhere.
- Gap: the baseline `lint-staged configuration block` signal does not resolve; `biome check` reports but does not auto-fix formatting (no `--write`). Deliberate deviation.
- Remediation: accept as intentional, or add a `lint-staged` block running `biome check --write`.

### staged-file-linter — misconfigured
Biome lints staged files, but via `biome check --staged`, not `lint-staged`.
- Evidence: `@biomejs/biome@^1.9.4`; `biome.json` `linter.enabled = true` (recommended + `noUnusedImports` / `noUnusedVariables`); `.husky/pre-commit:12` runs `biome check --staged`; no `lint-staged` block.
- Gap: lint runs on staged files (good) but `--write`/`--fix` is not passed; baseline `lint-staged` signal unresolved. Deliberate deviation.
- Remediation: accept, or migrate to `lint-staged` with `biome check --write`.

### type-check-on-staged-files — misconfigured
A type check runs on commit, but over the whole project, not staged files.
- Evidence: `typescript@^5.7.2`; `tsconfig.json`; `.husky/pre-commit:9` runs `pnpm typecheck` (`tsc --noEmit`), full-project, no `tsc-files` scoping.
- Gap: stronger than nothing, but the baseline staged-scoping signal does not resolve, so misconfigured.
- Remediation: keep the full check (stricter, fine for a small template), or add `tsc-files` to scope to staged files for a tighter loop.

### commit-message-lint — present
Conventional Commits enforced on commit-msg.
- Evidence: `@commitlint/cli`, `@commitlint/config-conventional`, `@commitlint/types`; `commitlint.config.ts` (extends config-conventional, curated `type-enum`, `subject-case`); `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"`.

### secret-scan-on-staged-content — present  *(moved from MISSING)*
Staged content is scanned for secrets before commit.
- Evidence: `.husky/pre-commit:18` runs `pnpm secret-scan` → `scripts/secret-scan.sh` → `gitleaks protect --staged --redact --no-banner` (conditional on the gitleaks binary). CI security job runs `gitleaks/gitleaks-action@v3` over full history as an unconditional backstop.
- Note: the local scan no-ops (exit 0) when gitleaks is not installed; CI is the hard floor. Consider bundling gitleaks into `setup:agents` to close the soft spot.

---

## Stage 2 — Pre-push

### pre-push-hook-configured — present
- Evidence: `.husky/pre-push` present, executable, wired via husky.

### full-type-check — missing
- Evidence: `.husky/pre-push` runs only `pnpm test:coverage`, `pnpm build`, `pnpm e2e`. No `pnpm typecheck`.
- Gap: type checking is owned by pre-commit (full `tsc --noEmit`) and CI (`ci.yml` quality job), not re-run on pre-push. Per the baseline the pre-push signal does not resolve.
- Remediation: add `pnpm typecheck` to `.husky/pre-push` to make it a full CI mirror, or accept the split by design.

### full-lint — missing
- Evidence: `.husky/pre-push` has no `biome check` / `eslint .`. Whole-repo lint runs only in CI (`ci.yml` quality job, `pnpm check`).
- Gap: only staged-scoped lint runs locally (pre-commit); whole-repo lint is CI-only.
- Remediation: add `pnpm check` to `.husky/pre-push`, or accept CI ownership.

### unit-tests — present
- Evidence: `.husky/pre-push:9` runs `pnpm test:coverage` (`jest --coverage`); `jest.config.ts` 80% global threshold.

### build-smoke — present  *(moved from MISSING)*
- Evidence: `.husky/pre-push:12` runs `pnpm build` (`vite build`) as a production-build smoke test.

---

## Stage 3 — Continuous Integration

### ci-workflow-present — present
- Evidence: `.github/workflows/ci.yml` (quality, fallow, test, build, e2e, security) plus `codeql.yml`, `lighthouse.yml`, `styleproof.yml`, `styleproof-approve.yml`. Triggers on push to main + PR.

### all-pre-push-gates-rerun-on-clean-checkout — present
- Evidence: each `ci.yml` job is a fresh `ubuntu-latest` checkout with `pnpm install --frozen-lockfile`, then quality → `pnpm typecheck` + `pnpm check`; test → `pnpm test:coverage`; build → `pnpm build` + `pnpm size`; e2e → playwright install + `pnpm e2e`. CI is a superset of the local hooks (it adds the full typecheck/lint that pre-push delegates).

### end-to-end-tests — present
- Evidence: `@playwright/test@^1.49.1`; `playwright.config.ts`; `ci.yml` e2e job runs `playwright install` then `pnpm e2e`.

### coverage-threshold-enforced — present
- Evidence: `jest.config.ts` `coverageThreshold.global` 80% (branches/functions/lines/statements); `ci.yml` test job runs `pnpm test:coverage`. `collectCoverageFrom` excludes index barrels / `main.tsx` / `App.tsx` (composition root, covered by E2E) — feature logic in scope.

### bundle-size-budget — present  *(moved from MISSING)*
- Evidence: `size-limit@^12.1.0` + `@size-limit/file`; `.size-limit.json` (JS 80 kB, CSS 5 kB on `dist/assets/*`); `package.json` `size: size-limit`; `ci.yml` build job `Bundle-size budget` step runs `pnpm size` after build.

### accessibility-checks — present  *(moved from MISSING)*
- Evidence (three layers): `@axe-core/playwright@^4.11.3` in `e2e/accessibility.spec.ts` (AxeBuilder, wcag2a/2aa/21a/21aa, zero violations) run by the `ci.yml` e2e job; `jest-axe@^10.0.0` extended in `jest.setup.ts` and used by `src/features/threshold-counter/ThresholdCounter.a11y.test.tsx` (CI test job); Lighthouse `categories:accessibility` >= 0.9 hard error.

### dependency-vulnerability-scan — present
- Evidence: `ci.yml` security job runs `pnpm audit --audit-level=high` and `gitleaks/gitleaks-action@v3`; `.github/dependabot.yml` weekly npm + github-actions updates.

### license-compliance-check — missing
- Evidence: no `license-checker` / `license-compliance` / `licensee` / `@inquirer/license-checker-rs` dependency; no workflow step enforcing a license allow/deny-list.
- Gap: the one genuinely absent CI gate. Nothing blocks an incompatible (e.g. copyleft) transitive license from entering the tree.
- Remediation: add `license-checker-rs`, define an SPDX allow-list, and add a CI step (e.g. in the security job) that fails on out-of-list licenses.

### lighthouse-ci — present  *(moved from MISSING)*
- Evidence: `@lhci/cli@^0.15.1`; `lighthouserc.json` (`staticDistDir ./dist`; accessibility >= 0.9 error, performance >= 0.8 warn, best-practices >= 0.9 warn, seo off); `.github/workflows/lighthouse.yml` runs on PR: build then `lhci autorun`.

---

## What changed vs the prior (pre-enhancement) run

Prior tally -> current tally:
- Pre-commit: present 2->3, misconfigured 3->3, missing 1->0.
- Pre-push: present 2->3, misconfigured 0->0, missing 3->2.
- CI: present 5->8, misconfigured 0->0, missing 4->1.

Gates that moved to **present**:
1. `secret-scan-on-staged-content` (pre-commit) — was missing.
2. `build-smoke` (pre-push) — was missing.
3. `bundle-size-budget` (CI) — was missing.
4. `accessibility-checks` (CI) — was missing.
5. `lighthouse-ci` (CI) — was missing.

Still graded short of present (unchanged, all deliberate except the last):
- `staged-file-formatter`, `staged-file-linter`, `type-check-on-staged-files`
  (pre-commit) — misconfigured: Biome `--staged` instead of `lint-staged`; full
  `tsc` instead of staged-scoped.
- `full-type-check`, `full-lint` (pre-push) — missing at this stage by design
  (owned by pre-commit + CI).
- `license-compliance-check` (CI) — genuinely missing, no tooling.
