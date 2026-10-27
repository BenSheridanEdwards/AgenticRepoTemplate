# Start here

Every agent doc for this repo lives in `.agents/`. The root `AGENTS.md` and
`CLAUDE.md` only point here. This file is the operating contract for **any**
agent or engineer: concrete commands, explicit rules, no tribal knowledge. When
the way we work changes, change it here.

Before reviewing a pull request, read [`REVIEW.md`](../REVIEW.md): the human-written
rules every automated reviewer applies after lint.

## What this repo is

A reference scaffold for **agentic engineering**: the files, gates, and context
that make AI-written code consistent and enterprise-grade. TypeScript + React is
just the runnable carrier. The scaffolding is the point (see the root
`README.md` and [`NORTH_STAR.md`](NORTH_STAR.md)).

## Run it

```bash
pnpm install          # install dependencies (Node ≥ 22.18, pnpm)
pnpm setup:agents     # install the external agentic toolkit (one time)
pnpm dev              # run web (http://localhost:5173) and api (:3001) together; Vite proxies /trpc
pnpm lint:policy      # ESLint: policy, React hooks, and React Compiler rules
pnpm arch:check       # architecture gate, structure check, diagram freshness, API report freshness
pnpm arch:diagram     # regenerate docs/architecture/roles.mmd and each result's architecture.mmd
pnpm api:report       # regenerate each package's etc/*.api.md after an intended export change
pnpm verify           # the full local gate suite (typecheck → biome → eslint → react doctor → fallow → architecture → tests → build)
pnpm e2e              # playwright test: every spec in each result's web/e2e/, with its api and web servers
```

## Run the trials

The orchestrator runs each trial; an agent inside a trial builds its
result from the prompt alone. Run trials one at a time, from the checkout
that keeps the evidence, at the scaffold revision every trial shares
([ADR 0034](decisions/0034-trial-harness-and-evidence.md)):

```bash
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir> --dry-run   # print the plan and the exact claude argv
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir>             # clone, run one fresh session, check, record
pnpm trial --task tooling/trial/tasks/notes.json --trial 1 --scaffold <rev> --trials-root <dir>  # Notes brief
git fetch <dir>/todo-01-<stamp>/repo trial/todo-01:trial/todo-01         # keep the result branch
```

Pass `--agent codex` for a fresh Codex exec session (default: `claude`).
Pass `--task /absolute/path/task.json` for a task file; a task with a target
repository pins its own revision and needs no `--scaffold`. Task-local prompts
and acceptance commands stay outside the clone. External tasks use `land: patch`
and can set an absolute `evidenceDir` to keep private evidence outside this repo.
See [ADR 0048](decisions/0048-trial-tasks-and-codex.md). Todo Codex ids are
`todo-codex-01..03`. Notes ids are `notes-01..03` and
`notes-codex-01..03`; select its task file as above
([ADR 0071](decisions/0071-a-second-trial-brief.md)).
Compare currently keeps Todo runs and proves baselines per agent; land the
companion per-brief comparison before recording Notes trials.

The run writes `docs/trials/todo-01.json`, the agent's stream as
`todo-01.stream.jsonl` with secrets redacted (and `todo-01.patch` when it
fails), and prints its workdir. Fetch the result branch, then remove the
workdir before the next trial; the harness refuses to start while one
remains. Pass `--retry` only after a failure from before the agent started.

Each trial's commands use a private temp and cache folder inside its
workdir, and bubblewrap (`bwrap`) mounts that temp folder over `/tmp`, so the
agent sees only its own `/tmp` files. Install bubblewrap first: a trial fails
before its agent starts when `bwrap` fails to run. No time limit
applies. Stop a trial with Ctrl-C, and read how long it took from
`run.durationMs` and `run.agentDurationMs` in its record
([ADR 0038](decisions/0038-trial-isolation-and-no-time-limit.md)).

After the three trials, merge each passed result branch with `git merge --no-ff`,
commit every record, stream and patch, and run
`node tooling/trial/compare.mjs` to write `docs/trials/comparison.md`: the
full pass count, the shared baseline and each difference between the runs,
classified against the spec freedoms of
[ADR 0035](decisions/0035-trial-comparison.md) and
[ADR 0037](decisions/0037-type-only-edges-and-flagged-re-exports.md).
Read the report when compare exits non-zero for an inconsistent verdict,
a split baseline or failed runs
([ADR 0069](decisions/0069-trial-comparison-fixes-file-layout-and-mutation-outputs.md)).

## The golden rules

1. **Read before you write.** Architecture, conventions, the Definition of Done,
   the glossary, and ADRs live in this folder.
2. **Follow the patterns; copy the templates.** New files come from
   [`templates/`](templates/). Consistency is the deliverable.
3. **Behaviour is defined by the E2E map**, each result's `web/e2e/*.spec.ts`
   (for example `apps/web/e2e/greeting.spec.ts`), not by the implementation.
   Add behaviour there first. A feature's PRD in `docs/prd/` states its intent
   and links each behaviour to the test that proves it.
4. **When a gate fails, fix the cause.** Keep every gate and its config as it
   is; the checks below enforce this.
5. **Done means the gates are green.** Report a task complete once
   `pnpm verify` and `pnpm e2e` pass; see
   [`project/DEFINITION_OF_DONE.md`](project/DEFINITION_OF_DONE.md).
6. **PRs carry proof.** Complete the pull request template and follow
   [`project/PR_QUALITY.md`](project/PR_QUALITY.md) before opening a PR or
   marking it ready.
7. **Change rules in the open.** When a constraint is wrong, propose an ADR in
   [`decisions/`](decisions/) and change the rule there. Record each decision
   in an ADR, and keep code comments to the local reason for a line.
8. **Write declarative code.** Transform data with `map`, `filter`, `flatMap`
   and `reduce` over `const` bindings, in place of loops and mutation
   ([North Star §9](NORTH_STAR.md#9-declarative-over-imperative)).

## Rules and what enforces them

Each rule below fails a check when it is broken, so the check's message is the
first place to look. [`project/CONVENTIONS.md`](project/CONVENTIONS.md) lists
the code-level rules and their checks.

| Rule | Enforced by |
| --- | --- |
| Each in-scope source file has an architecture role; value imports between roles follow the table in [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md). Type-only imports may cross roles subject to slice isolation and route co-location: route value and type imports stay within their own folder, `@repo/ui`, the api-client public barrel and external npm packages ([ADR 0075](decisions/0075-canonical-colocated-routes.md)). Tests, E2E specs, configs, scripts and tooling sit outside the role table. | `pnpm lint:policy`, `pnpm arch:gate`, `pnpm fallow:audit`, `pnpm typecheck`; [North Star §2](NORTH_STAR.md#2-layers-import-downward-slices-stand-alone-decisions-live-in-adrs) names the limits. |
| Commits, PR titles, and branch names follow Conventional Commits. | commitlint on `commit-msg`; `PR quality` workflow |
| Run every applicable hook. Common bypasses (`--no-verify`, `git commit -n`, `HUSKY=0`, and `core.hooksPath`, alias, or config-include overrides) are refused for the supported command forms. | `.claude/hooks/block-gate-bypass.sh` in Claude Code and trusted Codex Bash sessions; [ADR 0027](decisions/0027-block-common-hook-bypasses.md) lists the gaps. CI re-runs the gates; hosted required checks govern merging. |
| A change that loosens or rewrites a gate (`.husky/**`, `.github/workflows/**`, `eslint.config.js`, `biome.json`, `commitlint.config.ts`, `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs`, `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts`), or any addition, edit, deletion or rename in `docs/prd/**` or of `.agents/NORTH_STAR.md`, waits for BenSheridanEdwards to tick the sign-off for its head commit. A tick counts when it is made as BenSheridanEdwards. | `enforcement-approval` status ([ADR 0023](decisions/0023-protect-only-the-files-that-run-the-gates.md), [ADR 0024](decisions/0024-sign-off-only-loosening-enforcement-changes.md), [ADR 0060](decisions/0060-product-intent-needs-sign-off.md)) |
| Done means every gate is green on the latest commit. | `Required gates` and the checks in `docs/required-gates.md` |
| A PR body keeps the template sections and carries inline proof. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with an ADR. | `pnpm check:adr` |
| Secrets stay out of commits. | gitleaks in pre-commit and CI |
| An ESLint exception lives in `eslint.config.js` with its reason; an inline `eslint-disable*`, `/* eslint <rule>: off */` or `/* global */` comment fails lint in every source file. | `pnpm lint:policy` (`noInlineConfig`, [ADR 0039](decisions/0039-block-inline-lint-disable-comments.md)) |
| Biome, ESLint and React Doctor fail on a warning. | Biome `--error-on-warnings`, ESLint `--max-warnings=0`, React Doctor `--blocking warning` ([ADR 0046](decisions/0046-fail-lint-on-warnings.md)); Fallow warnings remain nonblocking. |
| Each comment group in package TypeScript source keeps to four lines; longer reasoning goes in an ADR or doc. | ESLint `policy/no-large-comments` ([ADR 0050](decisions/0050-anti-slop-lint-policies.md)) |
| Outside result roots, every type suppression is a `@ts-expect-error` with its reason, and every `biome-ignore` carries its reason. In `apps/` and `showcase/<id>/`, fix the cause of a suppression. | `pnpm check:suppressions`; Biome for `biome-ignore`; the structure check's `suppression` rule rejects these directives and coverage pragmas in result roots. |
| Generated files match their source. | `pnpm arch:check`, `pnpm gates:check`, `pnpm api:check` |
| Gate and tooling scripts match a glob with `matchesGlob` from `node:path` or the tool's own file list. | `pnpm lint:policy` ([ADR 0041](decisions/0041-scripts-ask-the-tool-which-files-a-glob-covers.md)) |
| A test's child process starts from the allowlisted environment in `scripts/jest-global-setup.mjs`; a test passes any other variable it needs in `env`. | Jest `globalSetup` and `scripts/jest-env.test.ts` ([ADR 0042](decisions/0042-test-child-processes-get-an-allowlisted-environment.md)) |
| Guidance docs state rules as the action to take. | `pnpm check:docs` |
| Each PRD in `docs/prd/` links every behaviour it lists to the E2E test that proves it. | `pnpm check:docs` ([ADR 0045](decisions/0045-prds-state-intent-and-link-their-specs.md)) |
| A doc that ties sign-off to a file names only a file the enforcement gate guards. | `pnpm check:docs` ([ADR 0030](decisions/0030-docs-name-only-guarded-paths-for-sign-off.md)) |

Review holds the declarative-code target until a general check lands.
Transforms are partly enforced by Biome `style/useConst` and the React Hooks
rules `react-hooks/immutability`, `react-hooks/globals` and
`react-hooks/purity`; loops and other mutation are not enforced yet
([ADR 0061](decisions/0061-refine-the-software-factory-philosophy.md)).

Pre-commit runs `pnpm typecheck`, staged Biome lint and format,
`pnpm fallow:audit` (including complexity), and staged gitleaks. Review holds
the budget: each step must finish in under 30 seconds on a realistic staged
change, and a slower step receives careful review for a likely move to
pre-push ([ADR 0062](decisions/0062-pre-commit-steps-stay-under-30-seconds.md)).
The up-to-date-with-main check runs at push before `pnpm verify` (including
the build) and `pnpm e2e`, and in CI. The budget is documentation only;
record per-step timings in the PR.

Review judges whether a comment contains a decision that belongs in an ADR.
The comment cap checks length only; `pnpm check:adr` requires a record only
for a new dependency. A general decision-record check remains a target.

## Simplicity Mode

Use Ponytail for coding, review, refactor, and design tasks unless the user says
otherwise. Default level: `full`: delete code, reuse existing patterns, and use
stdlib or native platform features before adding abstractions or dependencies.

## What is here, and when to read it

| Path | Read it when… |
| --- | --- |
| [`project/AGENTIC_INFRASTRUCTURE.md`](project/AGENTIC_INFRASTRUCTURE.md) | …before changing agent guidance, hooks, workflows, or skills. |
| [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md) | …before adding or moving any module: the role table, the api file roles, the state model, and how to add a route, a feature or a procedure. It is the pattern you must follow. |
| [`project/CONVENTIONS.md`](project/CONVENTIONS.md) | …while writing code: naming, structure, imports, errors, state. |
| [`project/DEFINITION_OF_DONE.md`](project/DEFINITION_OF_DONE.md) | …before you claim a task is finished. The gates enforce this list. |
| [`project/QUALITY_GATES.md`](project/QUALITY_GATES.md) | …before changing hooks, scripts, CI, or tool ownership. |
| [`project/PR_QUALITY.md`](project/PR_QUALITY.md) | …before opening, updating, or marking a pull request ready. |
| [`REVIEW.md`](../REVIEW.md) | …before reviewing a pull request: the human-written rules every automated reviewer (Cursor Bugbot, Codex, Claude) applies after lint. |
| [`project/TECH_STACK.md`](project/TECH_STACK.md) | …to know which tool owns which concern (and what *not* to add). |
| [`project/GLOSSARY.md`](project/GLOSSARY.md) | …when you meet a domain term. Use these words exactly, in code and prose. |
| [`decisions/`](decisions/) | …to understand *why* a constraint exists before you challenge it. ADRs. |
| [`templates/`](templates/) | …when creating a new component, test, E2E flow, or PRD. Copy from here. |
| [`NORTH_STAR.md`](NORTH_STAR.md) | …to see where the repo is heading and why. |
| [`PROGRESS.md`](PROGRESS.md) | …when picking up multi-step work, or to checkpoint a task longer than three steps. |
| [`TODO.md`](TODO.md) | …to find handed-off work and its acceptance criteria. |
| [`CLAUDE_CODE.md`](CLAUDE_CODE.md) | …if you are Claude Code: skills, settings, hooks, and tooling. |
| [`GITNEXUS.md`](GITNEXUS.md) | …before editing a symbol: impact analysis and change detection. |
| [`openai.yaml`](openai.yaml) | …if you are an OpenAI-family agent: the same entry points as a manifest. |
| [`verify-agentic-template`](../.claude/skills/verify-agentic-template/SKILL.md) | …to drive the app and capture PR proof. |

## Safety

- Keep secrets out of commits; CI runs a secret scan and a dependency audit.
- Keep one owner per concern: Biome formats and runs general lint, ESLint runs
  policy and React rules, Jest and Playwright run tests. A new tool for an owned
  concern needs an ADR (see [`project/TECH_STACK.md`](project/TECH_STACK.md));
  `pnpm check:adr` fails a new dependency that no new ADR names.
- Treat generated artefacts (`apps/web/dist/`, `.cache/`, `coverage/`, `graphify-out/`,
  `.gitnexus/`) as disposable; regenerate them with their command.
