# Quality Gates

Quality gates turn standards into commands. The rule is simple: document a gate
only when a hook, script, workflow, or review checklist actually owns it.

## Gate matrix

| Stage | Owner | Gates |
| --- | --- | --- |
| Agent commands | `.claude/hooks/block-gate-bypass.sh` | Refuses the common hook bypasses (`--no-verify`, `git commit -n`, `HUSKY=0`, and writes to `core.hooksPath`, git aliases, or config includes) before Claude Code runs them. CI is the backstop for the gaps listed in ADR 0027. |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. |
| Pre-commit | `.husky/pre-commit` | `pnpm typecheck`, staged Biome (lint + format + imports), `pnpm fallow:audit` (including complexity in touched files), `pnpm secret-scan` (staged gitleaks). Each step must finish in under 30 seconds; review holds this budget ([ADR 0062](../decisions/0062-pre-commit-steps-stay-under-30-seconds.md)). |
| Pre-push | `.husky/pre-push` | Every pushed branch contains freshly fetched origin/main (the one local up-to-date check), then `pnpm verify` (the full local gate suite, including the production build) and `pnpm e2e` (Playwright E2E and axe scan for every result). A clean merge from main skips pre-commit, so this is where it gets checked. |
| Local proof | `pnpm verify` + `pnpm e2e` | Context layer, suppression reasons, positive doc phrasing, PRD links, required-gate contract, dependency ADR check, typecheck, Biome, ESLint policy lint, React Doctor, Fallow, architecture checks (`pnpm arch:check`), coverage, build, size, E2E. |
| Context layer | `scripts/check-context-layer.mjs` (`pnpm check:context`) | `AGENTS.md` and `CLAUDE.md` are short pointers to `.agents/START_HERE.md`, and `CLAUDE.md` imports it; the start-here guide, manifest, project docs, ledgers, house skills, and the review rules (`REVIEW.md`, referenced from `.agents/START_HERE.md` and from `.cursor/BUGBOT.md`) exist as real files. Each ADR is named `NNNN-slug.md`, uses its number once, and opens with a matching `# N.` title. No context doc has the same section twice under one parent. |
| CI quality | `.github/workflows/ci.yml` | PR head contains main, context layer, suppression reasons, positive doc phrasing, PRD links, dependency ADR check, typecheck, Biome, ESLint policy lint, React Doctor, Fallow, architecture gate, role diagram and API report freshness, tests, build, security. `Required gates` judges every lane and checks the contract. The E2E lane starts after unit tests pass ([ADR 0065](../decisions/0065-e2e-waits-for-unit-tests.md)). |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets (median of three runs) on PRs that touch UI-relevant files, as decided by the tested `scripts/lighthouse-scope.mjs`; other PRs report the same check green with audits skipped. |
| PR contract | `.github/workflows/pr-quality.yml` (`scripts/validate-pr-body.mjs`) | Template sections in order, inline proof or `Not applicable` with a reason, renderable https images, Conventional title, `<type>/<short-kebab-summary>` branch, no machine-local paths ([ADR 0020](../decisions/0020-pr-process-checks.md), [ADR 0051](../decisions/0051-pr-body-names-no-machine-local-path.md)). |
| Doc phrasing | `scripts/check-doc-phrasing.mjs` and `scripts/check-sign-off-docs.mjs` (`pnpm check:docs`) | Guidance docs state each rule as the action to take ([ADR 0021](../decisions/0021-guidance-docs-state-the-action.md)). A doc that ties sign-off to a file names only a file the enforcement gate guards ([ADR 0030](../decisions/0030-docs-name-only-guarded-paths-for-sign-off.md)). |
| PRD links | `scripts/check-prd-conflicts.mjs` (`pnpm check:docs`) | Each PRD in `docs/prd/` lists behaviours, and each behaviour links an E2E spec and the title of a test in it that runs ([ADR 0045](../decisions/0045-prds-state-intent-and-link-their-specs.md)). |
| Dependency ADR | `scripts/check-dependency-adr.mjs` (`pnpm check:adr`) | Each dependency name new since the merge base with the PR's base branch is named by an ADR added in the same change ([ADR 0020](../decisions/0020-pr-process-checks.md)). |
| Required gates | `scripts/required-gates.mjs` (`pnpm gates:check`) | The `Required gates` job fails unless every `ci.yml` lane passed or legitimately did not apply; the workflows and `docs/required-gates.md` match the contract. |
| Enforcement sign-off | `.github/workflows/enforcement-approval.yml` (`scripts/enforcement-approval.mjs`) | `enforcement-approval` status stays red on a PR that loosens or rewrites enforcement, or adds, edits, deletes or renames product intent in `docs/prd/**` or `.agents/NORTH_STAR.md`, until BenSheridanEdwards ticks the sign-off for the head commit ([ADR 0024](../decisions/0024-sign-off-only-loosening-enforcement-changes.md), [ADR 0060](../decisions/0060-product-intent-needs-sign-off.md)). |
| Merge confidence | `.github/workflows/confidence.yml` (`scripts/confidence-label.mjs`) | Grades every pull request `confidence: green`, `confidence: amber` or `confidence: red` from its gate results, the E2E coverage of its changed slices, its PRD status and the unit line coverage of its changed source files. Advisory: it grades an already-green PR and gates nothing ([ADR 0064](../decisions/0064-merge-confidence-label.md), [ADR 0067](../decisions/0067-grade-merge-confidence-on-changed-file-line-coverage.md)). |

The pre-commit Biome command is
`pnpm exec biome check --error-on-warnings --staged --no-errors-on-unmatched .`.
Only Biome and gitleaks are staged-scoped: typecheck covers the project, and
Fallow audits touched files against the last fetched `origin/main` (or local
`main` when the remote ref is absent). Pre-push refreshes that base before
`pnpm verify` audits again.

## Anti-slop policies

`pnpm lint:policy` enforces `policy/no-large-comments` (four physical lines
per adjacent comment group), `max-depth` (four nested blocks) and
`policy/use-ui-primitives` (Button and TextField from `@repo/ui`, with native
checkbox/radio controls allowed). The existing source globs cover every result.
`scripts/eslint-policy.test.ts` proves seeded failures and clean boundaries;
[ADR 0050](../decisions/0050-anti-slop-lint-policies.md) records the audit,
exemptions and comment threshold. These run in `pnpm verify`, pre-push and CI.

Slop is code more complex than the change needs, or code that breaks an
agreed convention ([North Star](../NORTH_STAR.md)). Biome, ESLint and React
Doctor fail on any warning
([ADR 0046](../decisions/0046-fail-lint-on-warnings.md)). Declarative code is
partly gated by Biome `style/useConst` and the React Hooks rules
`react-hooks/immutability`, `react-hooks/globals` and `react-hooks/purity`; a
general loop and mutation rule is a target with no owner yet.

## Advisory declarative-style lint

`pnpm lint:declarative` reports loops, parameter reassignment, `var`, `++`/`--`,
`let` that could be `const`, function-expression callbacks and array callbacks
that skip a return. New rules report warnings; existing Biome severities stay
unchanged. It stays outside `pnpm verify`, the hooks and CI, because those
gates fail on any warning
([ADR 0063](../decisions/0063-advisory-declarative-style-lint.md)).

## Tool ownership

- **Biome** owns formatting, import ordering, and general JavaScript/TypeScript
  lint.
- **ESLint** (`pnpm lint:policy`) owns policy rules, React hooks rules, React
  Compiler rules, and React Doctor rules through `eslint-plugin-react-doctor`.
  The repository's own rules live in `tooling/eslint-plugin-policy.js`
  ([ADR 0019](../decisions/0019-local-eslint-policy-plugin.md)).
- **React Doctor** (`pnpm react-doctor`) owns the project-level checks the
  ESLint plugin leaves out, such as duplicated JSX across files.
- **TypeScript** owns type semantics through `tsc --noEmit` over four programs:
  `tsconfig.json` (web packages and `packages/ui`, with the DOM and no Node
  types), `tsconfig.node.json` (root configs, Vite configs and e2e specs, on
  Node), `tsconfig.api.json` (api packages, `NodeNext`, `.ts` import
  extensions, `erasableSyntaxOnly`, no DOM) and `tsconfig.domain.json` (api
  domain modules, as the api program but with no Node types). All four extend
  `tsconfig.base.json`. The api program is composite and writes its
  declarations to `.cache/types`; the browser program references it, so it
  reads the api through those declarations and leaves api source, such as a
  `node:` import in `integrations.ts`, to the api program.
  `pnpm typecheck` builds both with `tsc -b --force tsconfig.json`.
  One gap follows (ADR 0034): a Node type in an exported api signature, such
  as a procedure that returns a `Buffer`, reaches the browser program as an
  unresolved name, and `skipLibCheck` turns it into `any` with no error.
- **Jest + React Testing Library** own component, hook and api behaviour in
  three projects: `web` (jsdom, every web package and `packages/ui`), `api`
  (node, every api package) and `tooling` (`scripts/`, `tooling/`). Coverage
  leaves out `index.ts` barrels and the composition roots `main.tsx`,
  `App.tsx` and `server.ts`.
- **jest-axe, @axe-core/playwright, and Lighthouse** own accessibility.
- **Playwright** owns user-visible behaviour through the E2E map. It runs one
  Chromium project per result from `tooling/results.mjs`, each with its own api
  and Vite servers, over every spec in `<result>/web/e2e/`. Each showcase result
  also gets `<id>-acceptance`, which runs the fixed Todo acceptance spec in
  `tooling/trial/acceptance/` against its servers.
- **Fallow** owns dead code, circular dependencies, complexity, the dependency
  graph, the architecture gate, the contract rule pack, and the role diagram.
- **API Extractor** owns the committed report of each public module's exported
  API.
- **CodeQL, gitleaks, pnpm audit, and the license check** own security and
  dependency risk.

Each lint rule has exactly one owner
([ADR 0010](../decisions/0010-lint-engine-ownership.md),
[ADR 0015](../decisions/0015-eslint-policy-stack-wiring.md)). Biome runs the fast
format, import, and general lint loop; ESLint and React Doctor run the React
policy layer; the remaining concerns sit with stronger gates at the layer where
the behaviour is observable.

## Architecture checks

[`.fallowrc.jsonc`](../../.fallowrc.jsonc) is the one rules file
([ADR 0014](../decisions/0014-fallow-owns-architecture-checks.md),
[ADR 0032](../decisions/0032-api-ui-greeting-and-contract.md)). It sets:

- `boundaries`: eleven role zones matched over every result by brace glob, and
  `coverage.requireAllFiles`, so a source file outside every role fails.
- `rulePacks`: [`tooling/architecture/contract.rules.jsonc`](../../tooling/architecture/contract.rules.jsonc),
  whose findings report as `contract/<id>` and fail as errors
  (`policy-violation: error`).
- `require-suppression-reason`: every `fallow-ignore` names its reason.
- `audit.gate: "all"`: `pnpm fallow:audit` fails error findings in a file the
  change touches, inherited ones included; warning-level findings remain
  nonblocking. `scripts/fallow-audit.sh` needs a base branch to run the audit.
- `ignoreExports`: only `RouterInputs` and `RouterOutputs` in each api-client
  barrel are exempt from unused export findings. The structure check pins
  those exports to the reference ([ADR 0054](../decisions/0054-domain-rules-in-application-and-a-fixed-api-client-surface.md)).
- `duplicates.ignore` and `health.ignore`: the six recorded `todo-01`, `todo-02`, `todo-03`,
  `todo-codex-01`, `todo-codex-02` and `todo-codex-03` directories under
  `showcase/` are excluded from duplication, styling, complexity findings and
  health scores. Dead-code and architecture checks still cover them; reference
  code and other result directories retain all Fallow checks
  ([ADR 0059](../decisions/0059-preserve-recorded-trial-outputs-in-duplication-analysis.md)).

Three checks read it. They run locally through `pnpm arch:check` (part of `pnpm verify`) and
in CI as steps of the `Code intelligence (Fallow)` job:

| Check | Command | Fails when |
| --- | --- | --- |
| Architecture gate | `pnpm arch:gate` (`fallow architecture -q`, then `node tooling/architecture/structure.mjs` and `node tooling/architecture/diagram.mjs --check`) | An import crosses a role boundary the rules file does not allow, a source file sits in no role, or a `contract/<id>` rule finds a banned import, call or effect. A result lacks a required role, holds a file outside its layout, a nested tool config or a symlink, departs from the reference manifest of its kind, has no e2e spec, imports another result or holds a suppression, or a showcase folder is incomplete. A feature's application lacks a value import or re-export from its domain (`application-without-domain-rule`), or a scaffold API report's export names or kinds differ from the reference (`scaffold-exports`). A single-route result holds web feature paths or feature API reports (`single-route-features`). A diagram is missing, stale or extra. |
| Role diagram | `pnpm arch:diagram && git diff --exit-code docs/architecture/roles.mmd` | The committed canonical diagram differs from a fresh render of the rules file. |
| API reports | `pnpm api:check` | A public entry's exports differ from its committed report. Each package entry gives `<package>/etc/<name>.api.md`, and each route, feature and api-client `index.ts` gives `<package>/etc/<folder>-<name>.api.md`. |

`pnpm api:report` rewrites the reports after an intended export change; commit
the diff with the change. The gate reads Fallow's exit code, because its JSON
output carries per-run ids and timings. The diagram and the reports are
generated bytes: Biome leaves `docs/architecture/*.mmd` and every package's
`etc/*.api.md` alone, and the intermediates live in the gitignored `.cache/`.

Each contract rule fails on a seeded violation in a committed test:
`tooling/architecture/boundaries.test.ts` (Fallow zones, coverage and rule
pack), `scripts/eslint-policy.test.ts` (ESLint policy and contract rules),
`tooling/architecture/typescript.test.ts` (the web and api TypeScript programs),
`tooling/architecture/structure.test.ts` and `diagram.test.ts` (the structure
rules and the diagrams, with a temporary showcase-shaped result) and
`scripts/biome-overrides.test.ts` (the Biome naming override over every
package `src/`). `pnpm test` runs them.

## Lighthouse scope

`scripts/lighthouse-scope.mjs` decides whether a pull request is UI-relevant.
It counts the shipped sources `apps/web/src/` and `packages/ui/src/` (test
files excluded), `apps/web/public/`, and the files that change the bundle or
the audit, including `apps/web/index.html`, `apps/web/vite.config.ts`, both
`package.json` files of the web app and the ui kit, `tsconfig.base.json`,
`tsconfig.json` and the lockfile.

## Required gates

[`scripts/required-gates.mjs`](../../scripts/required-gates.mjs) is the one
list of required checks ([ADR 0017](../decisions/0017-required-gates-aggregate.md)).
[`docs/required-gates.md`](../../docs/required-gates.md) is generated from it by
`pnpm gates:inventory`.

- **Why an aggregate.** GitHub counts a skipped job as a passing required
  check. The `Required gates` job in `ci.yml` reads every lane's result and
  fails unless each one succeeded. A skip passes only where the lane's
  applicability rule says the lane does not apply: `Branch contains main` runs
  on pull requests into `main` alone.
- **Why `if: always()`.** The aggregate must run when a lane fails or the run
  is cancelled. With `!cancelled()` it would be skipped, and a skipped check
  reads as a pass. A superseded push therefore ends with a red or cancelled
  `Required gates` on the old commit.
- **Why four checks stay outside it.** CodeQL, Lighthouse, Visual regression, and the PR body
  check run on triggers `ci.yml` does not share, so they sit outside `needs`.
  Configure branch protection to require them directly. The contract still pins
  their job names and job-level `if:`; it does not install platform settings.
  Check [hosted prerequisites](../../docs/hosted-security.md) when onboarding.
- **Freshness.** `pnpm gates:check` runs in `pnpm verify` and in the aggregate
  job. It fails on a missing or renamed job, a changed job-level `if:`, a
  `continue-on-error` gate job, a `ci.yml` job outside the contract, any change
  to the aggregate job's text (its `needs`, `if: always()`, or steps), or a
  stale inventory. Inside every gate job it also fails on a step that sets
  `continue-on-error`, carries an `if:` that could skip the work, or ignores a
  command's exit code. Evidence uploads (`actions/upload-artifact` on
  `failure()`) and Lighthouse's declared skip condition are the exceptions. The
  inventory lists the step rules, rendered from `STEP_POLICY`. The reader
  needs no YAML dependency because it accepts one layout. A line outside that
  layout fails the check, so no step goes unread.
- **Local versus hosted proof.** `pnpm verify` and `pnpm e2e` mirror every lane
  with a local command. The security audit and CodeQL run only on GitHub, and
  Lighthouse runs locally only on request. Hosted readiness is a green
  `Required gates` plus the four stand-alone checks on the latest commit.
- **Selecting the check.** In branch protection for `main`, require the checks
  listed under "Checks to require" in the inventory. Compare the live settings:
  `gh api repos/OWNER/REPO/branches/main/protection/required_status_checks | node scripts/required-gates.mjs --protection`.
  Until a maintainer requires `Required gates`, it reports without blocking.

## Showcase results and trials

Every gate reaches a showcase result by the globs it uses for the reference
([ADR 0034](../decisions/0034-trial-harness-and-evidence.md)).

| Check | Command | Fails when |
| --- | --- | --- |
| Inclusion | `pnpm test` (`tooling/trial/inclusion.test.ts`) | A gate config stops reaching a showcase result. The test copies the reference greeting into a temporary `showcase/x/`, runs each gate's real tool on it (Playwright, pnpm build, ESLint, React Doctor, Biome, TypeScript, Jest coverage, `arch:gate`, Fallow, `check:adr`, `check:suppressions`), checks that `arch:gate` names the result, seeds violations that ESLint, Biome, the api type check, Fallow, the structure validator, `check:adr` and `check:suppressions` must fail, and seeds a `node:` import in the result's api `integrations.ts` that `pnpm typecheck` and `pnpm api:check` must pass. |
| Coverage per result | `pnpm test:coverage` (`tooling/coverage-by-result.mjs`) | Any one result is under 80 percent in lines, statements, functions or branches, whatever the global total. |
| Todo acceptance | `pnpm e2e` (project `<id>-acceptance`) | A showcase result breaks the fixed UI contract in `tooling/trial/todo-prompt.md`. |
| Trial harness | `pnpm test` (`tooling/trial/run-trial.test.ts`, `evidence.test.ts`) | The harness drifts from the run protocol: the exact agent argv and environment, the private temp folder mounted over `/tmp` and no time limit, the pinned clone, the scope and read checks, the one hook-run commit, the checks on a clean clone, the patch for a failed run, or the evidence schema and its duration rules. The tests run a fake agent in place of Claude, so CI runs them offline. CI has no bubblewrap, so most tests run each command unconfined; one proves the run fails before the agent when `bwrap` fails, and one checks the host gives a private `/tmp` or that failure. |

## Visual style checking

`Visual regression` (`.github/workflows/visual.yml`) runs `pnpm visual` on the
same UI-relevant pull requests as Lighthouse. Their shared scope also includes
visual baseline PNGs, `apps/web/e2e/visual.spec.ts`, `playwright.config.ts` and
`.github/workflows/visual.yml`, so changes to the comparison's own inputs run it.
Playwright compares desktop and
mobile reference greeting screenshots with committed PNG baselines. Other PRs
pass through the declared scope rule. Run `pnpm visual:update` on Linux with
the lockfile's Chromium, inspect and commit the intended baseline changes,
then rerun `pnpm visual`. CI compares only; missing baselines and visual diffs
fail, with failure images uploaded as `visual-differences`.
[ADR 0052](../decisions/0052-playwright-visual-regression.md) supersedes the pause.
The check is required directly in branch protection alongside the other
stand-alone checks in the generated inventory.

## Enforcement approval

[`enforcement-approval.yml`](../../.github/workflows/enforcement-approval.yml)
applies [ADR 0024](../decisions/0024-sign-off-only-loosening-enforcement-changes.md)
to the files [ADR 0023](../decisions/0023-protect-only-the-files-that-run-the-gates.md)
protects, with the product-intent paths added by
[ADR 0060](../decisions/0060-product-intent-needs-sign-off.md). A PR that loosens
or rewrites enforcement, or changes product intent, waits for Ben's sign-off.
Every other PR passes with no comment.

- **What asks.** `GUARDS` in
  [`scripts/enforcement-approval.mjs`](../../scripts/enforcement-approval.mjs)
  guards the files that run the gates and the gate itself: the git hooks
  (`.husky/**`), the CI workflows (`.github/workflows/**`), the lint files
  (`eslint.config.js`, `biome.json`, `commitlint.config.ts`,
  `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs`), and the
  gate's own script and test (`scripts/enforcement-approval.mjs`,
  `scripts/enforcement-approval.test.ts`). It compares each guarded file at the
  merge base and at the head. Any edit to a hook, a workflow, the gate's script
  or test, or a lint file other than `biome.json` asks. In `biome.json`, a
  lowered rule, an added ignore entry, a removed or newly created include list,
  or a strictness flag turned off asks, and raising a rule passes.
- **Product intent.** The Product intent guard covers `docs/prd/**` and
  `.agents/NORTH_STAR.md`. Every addition, edit, deletion or rename needs
  Ben's sign-off, including wording-only edits: intent has no tighten/loosen
  direction. A rename counts when either side is guarded. Other docs, such as
  `.agents/PROGRESS.md`, stay outside the guard, as do `package.json`, the
  lockfile, the rest of `scripts/`, and `tsconfig.json`.
- **One comment, one box, one approver.** The comment lists each change and
  names the head commit, and its box reads `Approve these enforcement changes
  at <sha>`. The status turns green only on the edit in which the GitHub user
  `BenSheridanEdwards` turns that head's unticked box into a ticked one. The
  gate reads that from the edit event alone, not from the comment text. Any other
  edit clears the box. When the gate clears a tick from any other account, the
  comment names that account in a one-line note.
- **The label records the tick.** On Ben's tick the gate adds a small italic
  note on the box line, such as `Approved by Ben @BenSheridanEdwards on
  Monday, the 12th of October, at 3 pm` in London time. Unticking removes it.
  The gate writes the label for people to read. The edit event and the gate's
  own status decide the sign-off, and the label text plays no part.
- **Each push resets it.** A new head commit, merging `main` in included, gets
  a fresh unticked comment with no label, and the status for that head stays
  red until Ben ticks again.
- **Main's copy judges the PR.** The workflow uses `pull_request_target`,
  checks out only the default branch's script, and reads file contents through
  the API. It runs no PR code. Require the `enforcement-approval` status in
  branch protection to make it blocking. A new guard takes effect after its
  implementation merges. The first subsequent PR touching a PRD provides the
  live check: record its red status, Ben's head-specific tick and the resulting
  green status in a follow-up comment on the implementation PR.
- **Dry run** against any two commits:
  `node scripts/enforcement-approval.mjs --git origin/main HEAD`.

## Merge confidence

Collect and upload `blast-radius` evidence in the CI `fallow` job on every run;
collection failures fail the lane ([ADR 0068](../decisions/0068-grade-merge-confidence-on-import-blast-radius.md)).

Use the advisory label and job summary from
[`.github/workflows/confidence.yml`](../../.github/workflows/confidence.yml)
to see the merge-confidence reasons ([ADR 0064](../decisions/0064-merge-confidence-label.md), [ADR 0067](../decisions/0067-grade-merge-confidence-on-changed-file-line-coverage.md)).
Keep the required gates as the merge bar.

- Assign `confidence: red` when a required check is failing, pending or
  missing, or when the head's CI coverage artifact (`coverage-final`) is missing
  or malformed (`coverage unavailable`). Read the aggregate and stand-alone checks from
  `scripts/required-gates.mjs`. Judge the latest run per name by the highest
  `started_at`, breaking ties with the highest `id`. Count `skipped` as passing
  only for a stand-alone gate with a declared `if` in that contract; treat
  every other non-success result as red.
- Assign `confidence: amber` when every required check passes and at least
  one named gap remains. Assign `confidence: green` when every required check
  passes, every changed slice has both an E2E spec and a PRD, and every changed
  source file meets the line-coverage threshold.
- Collect each changed slice from files under
  `<result>/web/src/routes/<name>/` or `<result>/web/src/features/<name>/`,
  where a result is `apps` or `showcase/<id>`.
- Count an E2E spec in `<result>/web/e2e/` when its path or text names the slice
  as a whole hyphenated slug: lowercase both sides, join runs of punctuation
  and spaces with hyphens, and match with hyphens on both ends. Match
  `page-header` with `Page Header`; keep `greet` distinct from `greeting`.
  Report a gap for a slice with no matching spec in its own result.
- Count a PRD in `docs/prd/` when it names the slice with the same whole-slug
  rule and links a spec in the slice's result (its text contains
  `<result>/web/e2e/`). Report a gap when that PRD is missing. Count unit line
  coverage too; keep browser code coverage outside this measure.
- Select changed source files with `collectCoverageFrom` in `jest.config.ts`.
  Report an amber gap for each file below `coverageThreshold.global.lines`
  (80%), naming its percentage, and for each file absent from valid coverage.
  Skip deleted files.
- Download the head's CI coverage artifact with `actions: read` and read it as
  JSON data only. Read the Jest config from the trusted default branch.
- Run main's script and gate contract, read the PR checkout only as data, and
  skip a completed run whose SHA differs from the live PR head. Expect the
  workflow to start grading subsequent PRs after it lands on main.
- Dry-run locally with an explicit check-run array; set `PR_ROOT` to read a
  separate checkout, or use its default of the current directory:

  ```bash
  pnpm test:coverage
  COVERAGE_FILE=coverage/coverage-final.json CHANGED="$(git diff --name-only origin/main...HEAD)" CHECK_RUNS='[]' node scripts/confidence-label.mjs --decide
  ```

  Expect red with this empty check-run array, because required results are
  missing. Supply the head's check runs to grade its actual results.

## Placement rules

- Put the fastest deterministic checks in pre-commit. Keep each pre-commit
  step under 30 seconds on a realistic staged change; record per-step timings
  in the PR. Examine a slower check carefully for a likely move to pre-push,
  with its placement decided in review. This budget is documentation only
  ([ADR 0062](../decisions/0062-pre-commit-steps-stay-under-30-seconds.md)).
- Put expensive behaviour checks in pre-push and CI.
- Run security and dependency checks in CI, with staged secret scanning locally.
- Keep CI as the clean-checkout backstop. CI runs every gate, whatever happened
  locally.
- Every branch must contain the latest origin/main
  (`scripts/require-up-to-date-main.sh`). The fix is
  `git fetch origin && git merge origin/main`. The check needs a fresh fetch,
  so it runs on pre-push and in CI, and pre-commit stays local and fast. A
  failed fetch fails closed. CI checks the PR head. Pre-push checks every
  pushed branch from git's pre-push stdin, whichever branch is checked out.
  Deletions, tags, and pushes to main are exempt.
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
