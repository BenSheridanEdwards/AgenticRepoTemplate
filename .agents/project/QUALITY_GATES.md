# Quality gates

Use this matrix to find a gate's owner and local command. Shared operating
rules live in [AGENTS.md](../../AGENTS.md); proof requirements live in
[PR quality](PR_QUALITY.md).

## Gate matrix

| Where it runs | Owning hook, workflow or tool | Gate | Local mirror |
| --- | --- | --- | --- |
| Agent commands | `.agents/hooks/block-gate-bypass.sh` | Common hook bypasses are refused; scope and gaps are in [ADR 0027](../decisions/0027-block-common-hook-bypasses.md). | Command guard; see ADR 0027 for gaps |
| Commit message | `.husky/commit-msg` | Conventional Commits via commitlint. | commitlint via commit-msg |
| Pre-commit | `.husky/pre-commit` | `pnpm typecheck`, staged Biome (lint + format + imports), `pnpm lint:anti-slop`, `pnpm fallow:audit` (including complexity in touched files), `pnpm secret-scan` (staged gitleaks). Each step must finish in under 30 seconds; review holds this budget ([ADR 0062](../decisions/0062-pre-commit-steps-stay-under-30-seconds.md)). | Run the hook commands below |
| Pre-push | `.husky/pre-push` | Every pushed branch contains freshly fetched origin/main (the one local up-to-date check), then `pnpm verify` (the full local gate suite, including the production build) and `pnpm e2e` (Playwright E2E and axe scan for every result). A clean merge from main skips pre-commit, so this is where it gets checked. | `pnpm verify` + `pnpm e2e` |
| Local proof | `pnpm verify` + `pnpm e2e` | Context layer, suppression policy, positive doc phrasing, PRD links, required-gate contract, dependency ADR check, typecheck, Biome, ESLint policy lint, vendored anti-slop rules (Oxlint), React Doctor, Fallow, architecture checks (`pnpm arch:check`), coverage per result and changed source, slice E2E mapping, build, size, E2E. | `pnpm verify` + `pnpm e2e` |
| Vendored anti-slop | `.oxlintrc.json` (`pnpm lint:anti-slop`) | Clean generic and Effect tag rules at `error`, with `--deny-warnings`, in pre-commit, `pnpm verify` and the existing CI quality job. `pnpm check:suppressions` rejects inline Oxlint rule directives. | `pnpm lint:anti-slop` |
| Context layer | `scripts/check-context-layer.mjs` (`pnpm check:context`) | Operating contract, harness wiring, project docs, house skills, ADR naming and unique context sections. | `pnpm check:context` |
| CI quality | `.github/workflows/ci.yml` | PR head contains main, context layer, suppression policy, positive doc phrasing, PRD links, dependency ADR check, typecheck, Biome, ESLint policy lint, vendored anti-slop rules (Oxlint), React Doctor, Fallow, architecture gate, role diagram and API report freshness, tests, changed-file coverage and slice E2E mapping, build, security. `Required gates` judges every lane and checks the contract. The E2E lane starts after unit tests pass ([ADR 0065](../decisions/0065-e2e-waits-for-unit-tests.md)). | `pnpm verify` + `pnpm e2e`; security audit is hosted |
| CI security | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript analysis. | Hosted only |
| CI nonfunctional | `.github/workflows/lighthouse.yml` | Lighthouse budgets (median of three runs) on PRs that touch UI-relevant files, as decided by the tested `scripts/lighthouse-scope.mjs`; other PRs report the same check green with audits skipped. | `pnpm lhci` on request |
| PR contract | `.github/workflows/pr-quality.yml` (`scripts/validate-pr-body.mjs`) | Template proof, title, branch and portable paths; [PR quality](PR_QUALITY.md) owns the body requirements. | `pnpm validate:pr` with PR environment fields |
| Doc phrasing | `scripts/check-doc-phrasing.mjs` and `scripts/check-sign-off-docs.mjs` (`pnpm check:docs`) | Positive rules and guarded sign-off paths ([ADR 0021](../decisions/0021-guidance-docs-state-the-action.md), [ADR 0030](../decisions/0030-docs-name-only-guarded-paths-for-sign-off.md)). | `pnpm check:docs` |
| PRD links | `scripts/check-prd-conflicts.mjs` (`pnpm check:docs`) | PRD behaviours link running E2E tests ([ADR 0045](../decisions/0045-prds-state-intent-and-link-their-specs.md)). | `pnpm check:docs` |
| Dependency ADR | `scripts/check-dependency-adr.mjs` (`pnpm check:adr`) | New dependency names appear in an ADR added with the change ([ADR 0020](../decisions/0020-pr-process-checks.md)). | `pnpm check:adr` |
| Required gates | `scripts/required-gates.mjs` (`pnpm gates:check`) | The `Required gates` job fails unless every `ci.yml` lane passed or legitimately did not apply; the workflows and `docs/required-gates.md` match the contract, and every hook command and `verify` step has a required CI equivalent. | `pnpm gates:check` |
| Enforcement sign-off | `.github/workflows/enforcement-approval.yml` (`scripts/enforcement-approval.mjs`) | Head-specific approval for enforcement or product-intent changes; see [Enforcement approval](#enforcement-approval). | `node scripts/enforcement-approval.mjs --git origin/main HEAD` |
| Merge confidence | `.github/workflows/confidence.yml` (`scripts/confidence-label.mjs`) | Green, amber or red label from gates, E2E/PRD coverage, unit coverage and import blast radius. Coverage gaps grade red and fail the required coverage lane. | `node scripts/confidence-label.mjs --decide` with head evidence |
| `pnpm verify`, CI | Lockfile checker | Stable installs | `pnpm check:lockfile` |
| Unit tests in verify/CI | Jest (`tooling/trial/`) | Result inclusion and trial protocol | `pnpm test` |
| `pnpm verify`, CI | Jest and `tooling/coverage-by-result.mjs` | Coverage per result | `pnpm test:coverage` (80% in every metric per result) |
| `pnpm verify`, CI | Changed-file coverage | Each changed source meets Jest's global line threshold; each changed slice has a named E2E spec. Missing coverage fails. | `pnpm coverage:changed` |
| E2E in pre-push and CI | Playwright `<id>-acceptance` | Todo acceptance | `pnpm e2e` |
| CI visual | `.github/workflows/visual.yml` (Playwright) | Reference desktop/mobile screenshot comparison on the shared UI scope; other PRs pass through its scope rule. | `pnpm visual` on Linux |

## Hook commands and scope

Pre-commit runs these steps in order:

1. `pnpm typecheck`
2. `pnpm exec biome check --error-on-warnings --staged --no-errors-on-unmatched .`
3. `pnpm lint:anti-slop`
4. `pnpm fallow:audit`
5. `pnpm secret-scan`

Biome and gitleaks read staged content. Typecheck covers the project; Oxlint
covers its configured sources. Fallow audits touched files against the last
fetched `origin/main`, falling back to local `main` when the remote ref is absent.
Keep each pre-commit step under 30 seconds and record its timing in the PR
([ADR 0062](../decisions/0062-pre-commit-steps-stay-under-30-seconds.md)).

Pre-push checks every pushed branch against freshly fetched `origin/main`,
then runs `pnpm verify` and `pnpm e2e`. A failed fetch fails the check.
Clear Git-local hook variables before tests that create other repositories:
`unset $(git rev-parse --local-env-vars)`.
See [ADR 0028](../decisions/0028-pre-push-runs-the-full-local-gate-suite.md).

## Tool ownership

- Biome owns formatting, import ordering, and general JavaScript/TypeScript
  lint.
- ESLint (`pnpm lint:policy`) owns policy rules, React hooks rules, React
  Compiler rules, and React Doctor rules through `eslint-plugin-react-doctor`.
  The repository's own rules live in `tooling/eslint-plugin-policy.js`
  ([ADR 0019](../decisions/0019-local-eslint-policy-plugin.md)).
- Oxlint (`pnpm lint:anti-slop`) runs only the vendored generic and Effect
  anti-slop plugins; every built-in Oxlint rule stays off.
- React Doctor (`pnpm react-doctor`) owns the project-level checks the
  ESLint plugin leaves out, such as duplicated JSX across files.
- TypeScript owns type semantics through `tsc --noEmit` over four programs:
  `tsconfig.json` (web packages and `packages/ui`, with the DOM and no Node
  types), `tsconfig.node.json` (root configs, Vite configs and e2e specs, on
  Node), `tsconfig.api.json` (api packages, `NodeNext`, `.ts` import
  extensions, `erasableSyntaxOnly`, no DOM) and `tsconfig.domain.json` (api
  domain modules without Node types). All extend `tsconfig.base.json`.
  See [ADR 0034](../decisions/0034-trial-harness-and-evidence.md) for the
  program boundaries and their limits.
- Jest + React Testing Library own component, hook and api behaviour in
  three projects: `web` (jsdom, every web package and `packages/ui`), `api`
  (node, every api package) and `tooling` (`scripts/`, `tooling/`). Coverage
  leaves out `index.ts` barrels and the composition roots `main.tsx`,
  `App.tsx` and `server.ts`.
- jest-axe, @axe-core/playwright, and Lighthouse own accessibility.
- Playwright owns user-visible behaviour through the E2E map. It runs one
  Chromium project per result from `tooling/results.mjs`, each with its own api
  and Vite servers, over every spec in `<result>/web/e2e/`. Each showcase result
  also gets `<id>-acceptance`, which runs the fixed Todo acceptance spec in
  `tooling/trial/acceptance/` against its servers.
- Fallow owns dead code, circular dependencies, complexity, the dependency
  graph, the architecture gate, the contract rule pack, and the role diagram.
- API Extractor owns the committed report of each public module's exported
  API.
- CodeQL, gitleaks, pnpm audit, and the license check own security and
  dependency risk.

Each lint rule has one owner ([ADR 0010](../decisions/0010-lint-engine-ownership.md),
[ADR 0015](../decisions/0015-eslint-policy-stack-wiring.md)).

## Architecture checks

Fallow reads [`.fallowrc.jsonc`](../../.fallowrc.jsonc) for role boundaries,
source coverage and the [contract rules](../../tooling/architecture/contract.rules.jsonc).
See [Architecture](ARCHITECTURE.md) for the roles and result structure.

| Gate | Where it runs | Owning tool | Local mirror |
| --- | --- | --- | --- |
| Role boundaries, structure, contracts and diagram freshness | `pnpm verify`, pre-push, CI Fallow job | Fallow, structure and diagram scripts | `pnpm arch:gate` |
| Canonical role diagram | Same architecture suite | Diagram script | `pnpm arch:diagram && git diff --exit-code docs/architecture/roles.mmd` |
| Public API reports | Same architecture suite | API Extractor | `pnpm api:check` |

`pnpm arch:check` runs all three. Use `pnpm api:report` for an intended export
change and commit the generated reports. Architecture ownership and generated
outputs are recorded in [ADR 0014](../decisions/0014-fallow-owns-architecture-checks.md),
[ADR 0033](../decisions/0033-result-diagrams-and-structure-validation.md) and
[ADR 0054](../decisions/0054-domain-rules-in-application-and-a-fixed-api-client-surface.md).
Recorded trial exclusions are documented in
[ADR 0059](../decisions/0059-preserve-recorded-trial-outputs-in-duplication-analysis.md).

## Required gates

[`scripts/required-gates.mjs`](../../scripts/required-gates.mjs) owns the check
contract and generates [the inventory](../../docs/required-gates.md) with
`pnpm gates:inventory`. `pnpm gates:check` checks workflow and inventory freshness.
Its `HOOK_STEPS` table maps every command in the three local hooks and every
step of `verify` to the required lane and CI step that repeats its check.
Add the CI step and its mapping together when adding a local gate. A missing
mapping, CI step or required lane fails the check
([CI re-runs every local hook step](../decisions/0087-ci-re-runs-every-local-hook-step.md)).
Staged Biome maps to the full-tree check, staged secrets to the history scan,
and commitlint to PR-title validation because the title becomes the squash
commit message. `verify` runs across the aggregate's lanes; each child step
has its own mapping.
Require the aggregate and the inventory's stand-alone checks in branch protection;
see [ADR 0017](../decisions/0017-required-gates-aggregate.md) for aggregate
semantics and [hosted prerequisites](../../.github/SECURITY.md) for setup.

Lighthouse and Visual regression share `scripts/lighthouse-scope.mjs`.
For visual baselines, run `pnpm visual:update` on Linux with the lockfile's
Chromium, inspect and commit changes, then rerun `pnpm visual`
([ADR 0052](../decisions/0052-playwright-visual-regression.md)).

## Enforcement approval

See the guarded-path rule in [AGENTS.md](../../AGENTS.md#rules-and-what-enforces-them).
The workflow uses main's script and reads PR files as data. Approval belongs to
the configured approver and the current head; a new head resets it.
[ADR 0023](../decisions/0023-protect-only-the-files-that-run-the-gates.md),
[ADR 0024](../decisions/0024-sign-off-only-loosening-enforcement-changes.md) and
[ADR 0060](../decisions/0060-product-intent-needs-sign-off.md) record the rules.

## Merge confidence

The label and job summary explain coverage and import gaps. Changed source files
must meet Jest's `coverageThreshold.global.lines` (80%) and changed route or
feature slices must have an E2E spec that names them in their own result.
`Changed-file coverage` runs after unit tests, reads their `coverage-final`
artifact and fails on either gap or unavailable coverage. `Required gates`
judges that lane; `pnpm coverage:changed` repeats it locally after
`pnpm test:coverage` in `verify`.

Coverage gaps grade red. PRD and import blast-radius gaps stay amber. There is
no human override. A threshold change goes through review in `jest.config.ts`.
[Thin coverage blocks the merge](../decisions/0089-thin-coverage-blocks-the-merge.md)
amends the grading in
[Merge confidence label](../decisions/0064-merge-confidence-label.md) and
[Grade merge confidence on changed-file line coverage](../decisions/0067-grade-merge-confidence-on-changed-file-line-coverage.md).
[Grade merge confidence on import blast radius](../decisions/0068-grade-merge-confidence-on-import-blast-radius.md)
records the import evidence.

For trial commands and harness details, use [the trial runbook](../TRIALS.md),
[ADR 0034](../decisions/0034-trial-harness-and-evidence.md) and
[ADR 0048](../decisions/0048-trial-tasks-and-codex.md).
