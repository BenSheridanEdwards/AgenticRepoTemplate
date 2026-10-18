# Start here

Every agent doc for this repo lives in `.agents/`. The root `AGENTS.md` and
`CLAUDE.md` only point here. This file is the operating contract for **any**
agent or engineer: concrete commands, explicit rules, no tribal knowledge. When
the way we work changes, change it here.

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

## Run a Todo trial

The orchestrator runs each Todo trial; an agent inside a trial builds its
result from the prompt alone. Run trials one at a time, from the checkout
that keeps the evidence, at the scaffold revision every trial shares
([ADR 0034](decisions/0034-trial-harness-and-evidence.md)):

```bash
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir> --dry-run   # print the plan and the exact claude argv
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir>             # clone, run one fresh session, check, record
git fetch <dir>/todo-01-<stamp>/repo trial/todo-01:trial/todo-01         # keep the result branch
```

The run writes `docs/trials/todo-01.json`, the agent's stream as
`todo-01.stream.jsonl` with secrets redacted (and `todo-01.patch` when it
fails), and prints its workdir. Fetch the result branch, then remove the
workdir before the next trial; the harness refuses to start while one
remains. Pass `--retry` only after a failure from before the agent started.

After the three trials, merge each passed result branch with `git merge --no-ff`,
commit every record, stream and patch, and run
`node tooling/trial/compare.mjs` to write `docs/trials/comparison.md`: the
full pass count, the shared baseline and each difference between the runs,
classified against the spec freedoms of
[ADR 0035](decisions/0035-trial-comparison.md).

## The golden rules

1. **Read before you write.** Architecture, conventions, the Definition of Done,
   the glossary, and ADRs live in this folder.
2. **Follow the patterns; copy the templates.** New files come from
   [`templates/`](templates/). Consistency is the deliverable.
3. **Behaviour is defined by the E2E map**, each result's `web/e2e/*.spec.ts`
   (for example `apps/web/e2e/greeting.spec.ts`), not by the implementation.
   Add behaviour there first.
4. **When a gate fails, fix the cause.** Keep every gate and its config as it
   is; the checks below enforce this.
5. **Done means the gates are green.** Report a task complete once
   `pnpm verify` and `pnpm e2e` pass; see
   [`project/DEFINITION_OF_DONE.md`](project/DEFINITION_OF_DONE.md).
6. **PRs carry proof.** Complete the pull request template and follow
   [`project/PR_QUALITY.md`](project/PR_QUALITY.md) before opening a PR or
   marking it ready.
7. **Change rules in the open.** When a constraint is wrong, propose an ADR in
   [`decisions/`](decisions/) and change the rule there.

## Rules and what enforces them

Each rule below fails a check when it is broken, so the check's message is the
first place to look. [`project/CONVENTIONS.md`](project/CONVENTIONS.md) lists
the code-level rules and their checks.

| Rule | Enforced by |
| --- | --- |
| Every file has one architecture role, and imports follow the role table and the contract in [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md). | `pnpm lint:policy`, `pnpm arch:gate`, `pnpm fallow:audit`, `pnpm typecheck` |
| Commits, PR titles, and branch names follow Conventional Commits. | commitlint on `commit-msg`; `PR quality` workflow |
| Every hook runs; `--no-verify`, `git commit -n`, `HUSKY=0`, and `core.hooksPath`, alias, or config-include overrides are refused. | `.claude/hooks/block-gate-bypass.sh` (Claude Code, [ADR 0027](decisions/0027-block-common-hook-bypasses.md)); CI re-runs every gate |
| A change that loosens or rewrites a gate (`.husky/**`, `.github/workflows/**`, `eslint.config.js`, `biome.json`, `commitlint.config.ts`, `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs`, `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts`) waits for BenSheridanEdwards to tick the sign-off for its head commit. A tick counts when it is made as BenSheridanEdwards. | `enforcement-approval` status ([ADR 0023](decisions/0023-protect-only-the-files-that-run-the-gates.md), [ADR 0024](decisions/0024-sign-off-only-loosening-enforcement-changes.md)) |
| Done means every gate is green on the latest commit. | `Required gates` and the checks in `docs/required-gates.md` |
| A PR body keeps the template sections and carries inline proof. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with an ADR. | `pnpm check:adr` |
| Secrets stay out of commits. | gitleaks in pre-commit and CI |
| Every lint or type suppression names its rule and its reason. | `pnpm check:suppressions`; Biome for `biome-ignore` |
| Generated files match their source. | `pnpm arch:check`, `pnpm gates:check`, `pnpm api:check` |
| Guidance docs state rules as the action to take. | `pnpm check:docs` |
| A doc that ties sign-off to a file names only a file the enforcement gate guards. | `pnpm check:docs` ([ADR 0030](decisions/0030-docs-name-only-guarded-paths-for-sign-off.md)) |

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
| [`project/TECH_STACK.md`](project/TECH_STACK.md) | …to know which tool owns which concern (and what *not* to add). |
| [`project/GLOSSARY.md`](project/GLOSSARY.md) | …when you meet a domain term. Use these words exactly, in code and prose. |
| [`decisions/`](decisions/) | …to understand *why* a constraint exists before you challenge it. ADRs. |
| [`templates/`](templates/) | …when creating a new component, test, or E2E flow. Copy from here. |
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
