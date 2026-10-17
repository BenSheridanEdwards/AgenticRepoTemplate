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
pnpm install          # install dependencies (Node ≥ 22, pnpm)
pnpm setup:agents     # install the external agentic toolkit (one time)
pnpm dev              # run the app at http://localhost:5173
pnpm lint:policy      # ESLint: policy, React hooks, and React Compiler rules
pnpm arch:check       # architecture gate, role diagram freshness, API report freshness
pnpm arch:diagram     # regenerate docs/architecture/roles.mmd from .fallowrc.jsonc
pnpm api:report       # regenerate etc/*.api.md after an intended export change
pnpm verify           # the full local gate suite (typecheck → biome → eslint → react doctor → fallow → architecture → tests → build)
pnpm e2e              # the end-to-end behaviour map
```

## The golden rules

1. **Read before you write.** Architecture, conventions, the Definition of Done,
   the glossary, and ADRs live in this folder. Code that ignores them is
   rejected by the gates.
2. **Follow the patterns; copy the templates.** New files come from
   [`templates/`](templates/). Consistency is the deliverable.
3. **Behaviour is defined by the E2E map** (`e2e/app.spec.ts`), not by the
   implementation. Add behaviour there first.
4. **Never bypass the gates.** No `--no-verify`, no weakening `tsconfig.json` or
   `biome.json` to make red turn green. Fix the cause. (A hook enforces this.)
5. **Commits are Conventional** (`type(scope): subject`), enforced on commit.
6. **Done means the gates are green.** Do not report a task complete until
   `pnpm verify` and `pnpm e2e` pass. See
   [`project/DEFINITION_OF_DONE.md`](project/DEFINITION_OF_DONE.md).
7. **PRs need proof.** Before opening or marking a PR ready, complete the
   pull request template and follow [`project/PR_QUALITY.md`](project/PR_QUALITY.md).
8. **Change rules in the open.** If a constraint is wrong, propose an ADR in
   [`decisions/`](decisions/); don't quietly diverge.

## Simplicity Mode

Use Ponytail for coding, review, refactor, and design tasks unless the user says
otherwise. Default level: `full`: delete code, reuse existing patterns, and use
stdlib or native platform features before adding abstractions or dependencies.

## What is here, and when to read it

| Path | Read it when… |
| --- | --- |
| [`project/AGENTIC_INFRASTRUCTURE.md`](project/AGENTIC_INFRASTRUCTURE.md) | …before changing agent guidance, hooks, workflows, or skills. |
| [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md) | …before adding or moving any module. It is the pattern you must follow. |
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

- Do not commit secrets; CI runs a secret scan and a dependency audit.
- Keep one owner per concern: Biome formats and runs general lint, ESLint runs
  policy and React rules, Jest and Playwright run tests. A new tool for an owned
  concern needs an ADR (see [`project/TECH_STACK.md`](project/TECH_STACK.md));
  `pnpm check:adr` fails a new dependency that no new ADR names.
- Treat generated artefacts (`dist/`, `coverage/`, `graphify-out/`,
  `.gitnexus/`) as disposable; never edit them by hand.
