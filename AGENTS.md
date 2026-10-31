# Start here

This is the operating contract for every agent and engineer. Keep it current
when the way we work changes. Detailed guidance lives in `.agents/`.
This repo is a reference scaffold for agentic engineering; TypeScript and React
are its runnable example. See [README.md](README.md) and the [North Star](docs/NORTH_STAR.md).
Read [REVIEW.md](REVIEW.md) before reviewing a pull request.

## Run it

```bash
pnpm install          # install dependencies (Node ≥ 22.18, pnpm)
pnpm dev              # run web (http://localhost:5173) and api (:3001) together; Vite proxies /trpc
pnpm lint:policy      # ESLint: policy, React hooks, and React Compiler rules
pnpm lint:anti-slop   # Oxlint: vendored anti-slop gate rules; fails on any finding
pnpm arch:check       # architecture gate, structure check, diagram freshness, API report freshness
pnpm arch:diagram     # regenerate docs/architecture/roles.mmd and each result's architecture.mmd
pnpm api:report       # regenerate each package's etc/*.api.md after an intended export change
pnpm verify           # the full local gate suite (typecheck → biome → eslint → react doctor → fallow → architecture → tests → build)
pnpm e2e              # playwright test: every spec in each result's web/e2e/, with its api and web servers
```

For the trial runbook, read [TRIALS.md](.agents/TRIALS.md).

## Golden rules

1. Read the architecture, conventions, Definition of Done, glossary, and ADRs before writing code; use the map below.
2. Copy new files from [templates](.agents/templates/).
3. Define behaviour first in each result's `web/e2e/*.spec.ts` (for example `apps/web/e2e/greeting.spec.ts`). Each feature's PRD in `docs/prd/` states its intent and links each behaviour to its test.
4. Fix the cause of a failed gate; keep the gate and its config in place.
5. Report a task complete once `pnpm verify` and `pnpm e2e` pass; follow the [Definition of Done](.agents/project/PR_QUALITY.md#definition-of-done).
6. Complete the pull request template and follow [PR quality](.agents/project/PR_QUALITY.md) before opening a PR or marking it ready.
7. Propose an ADR in [decisions](.agents/decisions/) when a constraint needs to change, and change the rule there. Record decisions in ADRs; keep code comments for the local reason behind a line.
8. Write declarative transforms with `map`, `filter`, `flatMap` and `reduce` over `const` bindings ([North Star §9](docs/NORTH_STAR.md#9-declarative-over-imperative)). Review holds the remaining judgment under [REVIEW.md](REVIEW.md#scope-and-simplicity); see [ADR 0061](.agents/decisions/0061-refine-the-software-factory-philosophy.md) for the limits of lint.

For tasks longer than three steps, checkpoint in the PR body.
Prefer deletion, existing patterns, and stdlib or native platform features
before abstractions or dependencies.

## Before you push

Builders, including Codex, follow these steps before every push:

1. Commit the final changes, then run `pnpm lint:anti-slop` on the clean tracked tree.
2. Fix the cause. Keep every anti-slop rule, severity and ignore as it is, and
   add no `oxlint-disable` or `eslint-disable` comment. Commit fixes and rerun the gate.
3. Write `// SAFETY: <the checked invariant>` above a type assertion only when
   the code beside it checks that invariant; otherwise remove the assertion.
4. Run `pnpm verify` and `pnpm e2e`; `pnpm verify` runs `pnpm lint:anti-slop`.

For review findings, follow [REVIEW.md](REVIEW.md#anti-slop-findings).

## Rules and what enforces them

Each rule below fails a check when it is broken, so the check's message is the
first place to look. [`project/CONVENTIONS.md`](.agents/project/CONVENTIONS.md) lists
the code-level rules and their checks.

| Rule | Enforced by |
| --- | --- |
| Each in-scope source file has an architecture role; value imports between roles follow the table in [`project/ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md). Type-only imports may cross roles subject to slice isolation and route co-location: route value and type imports stay within their own folder, `@repo/ui`, the api-client public barrel and external npm packages ([ADR 0075](.agents/decisions/0075-canonical-colocated-routes.md)). Tests, E2E specs, configs, scripts and tooling sit outside the role table. | `pnpm lint:policy`, `pnpm arch:gate`, `pnpm fallow:audit`, `pnpm typecheck`; [North Star §2](docs/NORTH_STAR.md#2-layers-import-downward-slices-stand-alone-decisions-live-in-adrs) names the limits. |
| Commits, PR titles, and branch names follow Conventional Commits. | commitlint on `commit-msg`; `PR quality` workflow |
| Run every applicable hook. Common bypasses (`--no-verify`, `git commit -n`, `HUSKY=0`, and `core.hooksPath`, alias, or config-include overrides) are refused for the supported command forms. | `.agents/hooks/block-gate-bypass.sh` in Claude Code and trusted Codex Bash sessions; [ADR 0027](.agents/decisions/0027-block-common-hook-bypasses.md) lists the gaps. CI re-runs the gates; hosted required checks govern merging. |
| A change that loosens or rewrites a gate (`.husky/**`, `.github/workflows/**`, `eslint.config.js`, `biome.json`, `commitlint.config.ts`, `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs`, `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts`), or any addition, edit, deletion or rename in `docs/prd/**` or of `docs/NORTH_STAR.md`, waits for the approver (repo variable `ENFORCEMENT_APPROVER`, default `BenSheridanEdwards`) to tick the sign-off for its head commit. A tick counts when it is made as that approver. | `enforcement-approval` status ([ADR 0023](.agents/decisions/0023-protect-only-the-files-that-run-the-gates.md), [ADR 0024](.agents/decisions/0024-sign-off-only-loosening-enforcement-changes.md), [ADR 0060](.agents/decisions/0060-product-intent-needs-sign-off.md)) |
| Done means every gate is green on the latest commit. | `Required gates` and the checks in `docs/required-gates.md` |
| A PR body keeps the template sections and carries inline proof. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with an ADR. | `pnpm check:adr` |
| Secrets stay out of commits. | gitleaks in pre-commit and CI |
| An ESLint exception lives in `eslint.config.js` with its reason; an inline `eslint-disable*`, `/* eslint <rule>: off */` or `/* global */` comment fails lint in every source file. | `pnpm lint:policy` (`noInlineConfig`, [ADR 0039](.agents/decisions/0039-block-inline-lint-disable-comments.md)) |
| Biome, ESLint and React Doctor fail on a warning. | Biome `--error-on-warnings`, ESLint `--max-warnings=0`, React Doctor `--blocking warning` ([ADR 0046](.agents/decisions/0046-fail-lint-on-warnings.md)); Fallow has no warn-level rule. |
| Each comment group in package TypeScript source keeps to four lines; longer reasoning goes in an ADR or doc. | ESLint `policy/no-large-comments` ([ADR 0050](.agents/decisions/0050-anti-slop-lint-policies.md)) |
| Every inline suppression (TypeScript, Biome, Oxlint, ESLint, Fallow, coverage pragma) fails the gate. An exception lives in `ALLOWED_SUPPRESSIONS` in `scripts/check-suppressions.mjs`, which needs sign-off. | `pnpm check:suppressions`, plus the structure check in result roots. |
| Generated files match their source. | `pnpm arch:check`, `pnpm gates:check`, `pnpm api:check` |
| Gate and tooling scripts match a glob with `matchesGlob` from `node:path` or the tool's own file list. | `pnpm lint:policy` ([ADR 0041](.agents/decisions/0041-scripts-ask-the-tool-which-files-a-glob-covers.md)) |
| A test's child process starts from the allowlisted environment in `scripts/jest-global-setup.mjs`; a test passes any other variable it needs in `env`. | Jest `globalSetup` and `scripts/jest-env.test.ts` ([ADR 0042](.agents/decisions/0042-test-child-processes-get-an-allowlisted-environment.md)) |
| Guidance docs state rules as the action to take and use no em dash or AI filler phrase. | `pnpm check:docs` |
| Each PRD in `docs/prd/` links every behaviour it lists to the E2E test that proves it. | `pnpm check:docs` ([ADR 0045](.agents/decisions/0045-prds-state-intent-and-link-their-specs.md)) |
| A doc that ties sign-off to a file names only a file the enforcement gate guards. | `pnpm check:docs` ([ADR 0030](.agents/decisions/0030-docs-name-only-guarded-paths-for-sign-off.md)) |

For hook commands, order, and the 30-second pre-commit step budget, read
[Quality gates](.agents/project/QUALITY_GATES.md). Record per-step timings in the
PR ([ADR 0062](.agents/decisions/0062-pre-commit-steps-stay-under-30-seconds.md)).
For comment and decision-record judgment, read [REVIEW.md](REVIEW.md#naming-and-clarity).
The comment cap checks length; `pnpm check:adr` requires a record for new dependencies.
Keep one tool owner per concern; follow [Tech stack](.agents/project/TECH_STACK.md).
Regenerate disposable output (`apps/web/dist/`, `.cache/`, `coverage/`) with its command.

## Where things are

| Path | Read it when |
| --- | --- |
| [`HARNESSES.md`](.agents/HARNESSES.md) | before changing agent guidance, harness settings, hooks, or skills. |
| [`project/ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md) | before adding or moving any module: the role table, the api file roles, the state model, and how to add a route, a feature or a procedure. It is the pattern you must follow. |
| [`project/CONVENTIONS.md`](.agents/project/CONVENTIONS.md) | while writing code: naming, structure, imports, errors, state. |
| [`project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md) | before changing hooks, scripts, CI, or tool ownership. |
| [`project/PR_QUALITY.md`](.agents/project/PR_QUALITY.md) | before claiming completion or opening, updating, or marking a pull request ready. |
| [`REVIEW.md`](REVIEW.md) | before reviewing a pull request: the human-written rules every automated reviewer (Cursor Bugbot, Codex, Claude) applies after lint. |
| [`project/TECH_STACK.md`](.agents/project/TECH_STACK.md) | to know which tool owns which concern (and what *not* to add). |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | when you meet a domain term. Use these words exactly, in code and prose. |
| [`decisions/`](.agents/decisions/) | to understand *why* a constraint exists before you challenge it. ADRs. |
| [`templates/`](.agents/templates/) | when creating a new component, test, E2E flow, or PRD. Copy from here. |
| [`NORTH_STAR.md`](docs/NORTH_STAR.md) | to see where the repo is heading and why. |
| [`verify-agentic-template`](.agents/skills/verify-agentic-template/SKILL.md) | to drive the app and capture PR proof. |
