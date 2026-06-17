# Quality gates audit report

Static-only audit (no graphify graph — reduced context, every gate tagged
`noGraphify: true`) of a Node + React frontend template graded strictly against
the opinionated three-stage baseline. The repository has a genuinely strong,
honest posture, but several baseline gates resolve as `misconfigured` or
`missing` because the template uses `biome check --staged` directly instead of
`lint-staged`, runs its full type check at pre-commit rather than staged-scoped,
leaves type-check / full-lint / build-smoke out of pre-push, and omits four CI
gates (bundle-size budget, accessibility, license compliance, Lighthouse CI).

## Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Ecosystem: node · Package manager: pnpm · Hook runner: husky
- Graphify output present: no (static-only — reduced context)
- Generated: 2026-06-17T00:00:00Z

## Status tally

| Stage | Present | Misconfigured | Missing |
| --- | --- | --- | --- |
| Pre-commit | 2 | 3 | 1 |
| Pre-push | 2 | 0 | 3 |
| Continuous integration | 5 | 0 | 4 |

## Top recommendations

1. **Add a staged-content secret scan to pre-commit**
   - Why it matters: gitleaks runs only in CI, so a leaked credential is already
     in local history (and pushable) before the server ever sees it.
   - Smallest fix: add `gitleaks protect --staged --redact` as a step in
     `.husky/pre-commit`.
2. **Run type-check, full lint, and build smoke at pre-push**
   - Why it matters: pre-push only runs tests + e2e, so a type error, lint
     regression, or broken production build only surfaces in CI minutes later.
   - Smallest fix: append `pnpm typecheck`, `pnpm check`, and `pnpm build` to
     `.husky/pre-push`.
3. **Add a CI accessibility gate to the user-facing app**
   - Why it matters: this is a React UI template with zero automated a11y
     coverage; accessibility regressions ship silently.
   - Smallest fix: add `@axe-core/playwright` and assert `AxeBuilder` results in
     the existing Playwright e2e run.
4. **Add a bundle-size budget**
   - Why it matters: nothing measures shipped size, so a heavy dependency can
     bloat the bundle with no signal.
   - Smallest fix: add `size-limit` + a `.size-limit.json` budget and a
     `pnpm size-limit` CI step against `dist/`.
5. **Add a license-compliance check (and consider Lighthouse CI)**
   - Why it matters: a transitive copyleft/disallowed license can enter the tree
     unflagged; a user-facing app also has no performance budget.
   - Smallest fix: add `license-checker-rseidelsohn` with an allow-list as a CI
     step; optionally add `@lhci/cli` + `lighthouserc.json` + `lhci autorun`.

## Checks

### Stage 1 — Pre-commit

#### hook-runner-installed — present

- Expectation: Husky or Lefthook is configured for the repository.
- Evidence: `.husky/` with `commit-msg`, `pre-commit`, `pre-push`; `husky@^9.1.7`
  devDependency; `package.json` `scripts.prepare = "husky"`.
- Gap: None.
- Remediation: No action.

#### staged-file-formatter — misconfigured

- Expectation: Prettier or Biome formats staged files via lint-staged.
- Evidence: `@biomejs/biome@^1.9.4`; `biome.json` `formatter.enabled = true`;
  `.husky/pre-commit` runs `pnpm exec biome check --staged --no-errors-on-unmatched .`;
  NO `lint-staged` block and no `.lintstagedrc`.
- Gap: Formatting of staged files is done via `biome check --staged` invoked
  directly, not via a lint-staged block, so the baseline's `lint-staged`
  signal does not resolve. `biome check` without `--write` reports formatting
  issues but does not auto-apply them on commit.
- Remediation: Accept the direct `biome check --staged` approach as an
  intentional simplification, or add a lint-staged block running
  `biome check --write` so formatting is applied, not just reported.

#### staged-file-linter — misconfigured

- Expectation: ESLint or Biome lints staged files via lint-staged, with --fix
  allowed.
- Evidence: `@biomejs/biome@^1.9.4`; `biome.json` `linter.enabled = true`
  (recommended + custom rules); `.husky/pre-commit` runs `biome check --staged`;
  NO `lint-staged` block.
- Gap: Lint of staged files runs through `biome check --staged` directly rather
  than a lint-staged block, so the `lint-staged block invoking it` signal does
  not resolve. `--write`/`--fix` is not passed, so fixable issues are reported,
  not auto-applied.
- Remediation: Treat the direct invocation as an intentional design, or migrate
  to a lint-staged block with `biome check --write` for safe auto-fixes.

#### type-check-on-staged-files — misconfigured

- Expectation: `tsc --noEmit` runs against staged TypeScript files.
- Evidence: `typescript@^5.7.2`; `tsconfig.json` (`strict: true`, `noEmit: true`);
  `.husky/pre-commit` runs `pnpm typecheck` = `tsc --noEmit` over the WHOLE
  project; NO `tsc-files` / staged scoping.
- Gap: A type check runs on every commit, but it is a full-project check, not
  scoped to staged files. The intent (block type errors pre-commit) is met, but
  the staged-scoping signal does not resolve.
- Remediation: Acceptable for a small template (full typecheck is fast and
  catches cross-file regressions a staged check would miss). For larger repos,
  consider `tsc-files` in a lint-staged block.

#### commit-message-lint — present

- Expectation: commitlint enforces Conventional Commits on the subject line.
- Evidence: `@commitlint/cli@^19.6.1` + `@commitlint/config-conventional@^19.6.0`;
  `commitlint.config.ts` extends config-conventional with `type-enum` and
  `subject-case` rules; `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"`.
- Gap: None. Squash-merge PR-title enforcement is not covered (out of baseline
  scope).
- Remediation: No action. Optional: add a CI step validating PR titles.

#### secret-scan-on-staged-content — missing

- Expectation: gitleaks (`protect`) or detect-secrets runs against staged content
  before commit.
- Evidence: NO `.gitleaks.toml`; NO `.pre-commit-config.yaml`; NO secret-scan
  step in `.husky/pre-commit`. gitleaks runs ONLY in CI
  (`.github/workflows/ci.yml` security job, `gitleaks/gitleaks-action@v3`).
- Gap: No staged-content secret scan locally. A secret can be committed and
  pushed before CI catches it.
- Remediation: Add `gitleaks protect --staged --redact` (or detect-secrets) to
  `.husky/pre-commit` to complement the CI scan.

### Stage 2 — Pre-push

#### pre-push-hook-configured — present

- Expectation: A pre-push hook exists and is wired into the hook runner.
- Evidence: `.husky/pre-push` present and executable, managed by husky.
- Gap: None.
- Remediation: No action.

#### full-type-check — missing

- Expectation: `tsc --noEmit` runs over the entire project at pre-push.
- Evidence: `.husky/pre-push` runs only `pnpm test` and `pnpm e2e`; NO
  `pnpm typecheck` invocation. Typecheck DOES run at pre-commit and in CI.
- Gap: The pre-push hook runs no type check. The signal does not resolve, though
  it is partly mitigated by the full pre-commit typecheck and CI re-run.
- Remediation: Add `pnpm typecheck` to `.husky/pre-push`, or document that the
  pre-commit typecheck is the intended gate.

#### full-lint — missing

- Expectation: The lint command runs the whole codebase and fails on warnings.
- Evidence: `.husky/pre-push` runs only `pnpm test` and `pnpm e2e`; NO full-tree
  lint. Full lint (`pnpm check`) runs only at pre-commit (staged) and in CI.
  No `--max-warnings=0` equivalent — Biome `warn` rules (e.g.
  `noNonNullAssertion: warn`) never fail a gate.
- Gap: No whole-codebase lint before push; warning-level findings are silently
  shippable.
- Remediation: Add `pnpm check` to `.husky/pre-push`; consider promoting `warn`
  rules to `error` or failing on warnings.

#### unit-tests — present

- Expectation: Vitest or Jest runs the unit-test suite to completion at pre-push.
- Evidence: `.husky/pre-push` runs `pnpm test` = `jest`; `jest@^29.7.0` +
  `jest-environment-jsdom` via `jest.config.ts`.
- Gap: Minor — plain `jest`, not `jest --ci`; coverage thresholds are NOT
  enforced at pre-push (only in CI via `test:coverage`).
- Remediation: No blocking action. Optionally use `--ci` and/or run
  `pnpm test:coverage` at pre-push.

#### build-smoke — missing

- Expectation: The production build command runs and exits cleanly at pre-push.
- Evidence: `.husky/pre-push` runs only `pnpm test` and `pnpm e2e`; NO
  `pnpm build`. The pre-push Playwright run boots the Vite DEV server
  (`playwright.config.ts` `webServer = pnpm dev`), not a production build.
- Gap: A broken production build is not caught until CI's build job.
- Remediation: Add `pnpm build` to `.husky/pre-push`, or accept CI as the gate.

### Stage 3 — Continuous integration

#### ci-workflow-present — present

- Expectation: At least one workflow definition exists.
- Evidence: `.github/workflows/ci.yml`, `styleproof.yml`, `styleproof-approve.yml`.
- Gap: None.
- Remediation: No action.

#### all-pre-push-gates-rerun-on-clean-checkout — present

- Expectation: The workflow installs deps fresh and runs type-check, lint, unit
  tests, and build.
- Evidence: `ci.yml` `quality` job (`pnpm install --frozen-lockfile` →
  `pnpm typecheck` → `pnpm check`), `test` job (`pnpm test:coverage`), `build`
  job (`pnpm build`), `e2e` job (playwright install + `pnpm e2e`); every job
  does a fresh frozen-lockfile install.
- Gap: None — CI is in fact stricter than pre-push and covers the pre-push gaps.
- Remediation: No action.

#### end-to-end-tests — present

- Expectation: Playwright or Cypress runs against a build of the application.
- Evidence: `@playwright/test@^1.49.1`; `ci.yml` `e2e` job runs
  `playwright install --with-deps chromium` then `pnpm e2e`;
  `playwright.config.ts` present.
- Gap: Minor — in `ci.yml` the e2e job runs against the Vite dev server (no
  `E2E_BASE_URL` set), not a production build. The StyleProof workflow does run
  against the production preview build.
- Remediation: No blocking action. Optionally set `E2E_BASE_URL` against a
  `pnpm preview` server in the e2e job.

#### coverage-threshold-enforced — present

- Expectation: A coverage threshold is configured and the workflow fails when it
  is not met.
- Evidence: `jest.config.ts` `coverageThreshold.global = 80%` (branches /
  functions / lines / statements); `ci.yml` `test` job runs `pnpm test:coverage`.
- Gap: None. `App.tsx` / `main.tsx` are excluded from `collectCoverageFrom`, so
  the gate measures library/component code, not the app shell.
- Remediation: No action. Optionally narrow the exclusions as the shell grows.

#### bundle-size-budget — missing

- Expectation: A bundle-size check runs and fails when the budget is exceeded.
- Evidence: NO `size-limit` / `bundlewatch` / `@next/bundle-analyzer`; NO
  bundle-size step in any workflow.
- Gap: No bundle-size budget; bloat ships undetected.
- Remediation: Add `size-limit` + `.size-limit.json` budget + a CI
  `pnpm size-limit` step against `dist/`.

#### accessibility-checks — missing

- Expectation: Automated accessibility checks run against components or pages.
- Evidence: NO `@axe-core/*` / `pa11y` / `@storybook/addon-a11y`; NO a11y step
  in any workflow; Playwright tests do not assert a11y.
- Gap: No automated a11y coverage on a user-facing React app.
- Remediation: Add `@axe-core/playwright` and assert `AxeBuilder` results in the
  e2e run, or add `pa11y-ci` as a CI step.

#### dependency-vulnerability-scan — present

- Expectation: A vulnerability scanner runs against the lockfile.
- Evidence: `ci.yml` `security` job runs `pnpm audit --audit-level=high`
  (gitleaks secret scan in the same job).
- Gap: No Dependabot config (`.github/dependabot.yml` absent) — vulns are
  detected but dependency updates are manual.
- Remediation: No blocking action. Optionally add `.github/dependabot.yml`.

#### license-compliance-check — missing

- Expectation: A license check runs and enforces an allow-list or deny-list.
- Evidence: NO `license-checker` / `license-compliance` /
  `@inquirer/license-checker-rs`; NO license-check step in any workflow.
- Gap: No license-compliance gate; a disallowed/copyleft transitive license can
  enter the tree unflagged.
- Remediation: Add `license-checker-rseidelsohn` (or `license-compliance`) with
  an allow-list and a CI step that fails on disallowed licenses.

#### lighthouse-ci — missing

- Expectation: Lighthouse CI runs against a built version and asserts thresholds
  (recommended for user-facing apps; flagged but not always required).
- Evidence: NO `@lhci/cli`; NO `lighthouserc.*`; NO `lhci autorun` step.
- Gap: No Lighthouse CI; performance/SEO/best-practice regressions are
  unmeasured. StyleProof covers computed-style diffs, not Lighthouse budgets.
- Remediation: Recommended — add `@lhci/cli`, `lighthouserc.json` with assertion
  thresholds, and a CI `lhci autorun` step against the `pnpm preview` build.
