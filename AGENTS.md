# AGENTS.md

> The operating contract for **any** agent (or engineer) working in this repo.
> It is tool-agnostic and follows the [agents.md](https://agents.md) convention:
> write for the agent — concrete commands, explicit rules, no tribal knowledge.
> `CLAUDE.md` adds the Claude-Code-specific layer on top of this file.

## What this repo is

A reference scaffold for **agentic engineering**: the files, gates, and context
that make AI-written code consistent and enterprise-grade. TypeScript + React is
just the runnable carrier — the scaffolding is the point (see `README.md`).

## Run it

```bash
pnpm install          # install dependencies (Node ≥ 20, pnpm)
pnpm setup:agents     # install the external agentic toolkit (one time)
pnpm dev              # run the app at http://localhost:5173
pnpm verify           # the full local gate suite (typecheck → biome → fallow → tests → build)
pnpm e2e              # the end-to-end behaviour map
```

## The golden rules

1. **Read `.agents/` before you write.** Architecture, conventions, the
   Definition of Done, the glossary, and ADRs live there. Code that ignores them
   is rejected by the gates.
2. **Follow the patterns; copy the templates.** New files come from
   `.agents/templates/`. Consistency is the deliverable.
3. **Behaviour is defined by the E2E map** (`e2e/app.spec.ts`), not by the
   implementation. Add behaviour there first.
4. **Never bypass the gates.** No `--no-verify`, no weakening `tsconfig.json` or
   `biome.json` to make red turn green. Fix the cause. (A hook enforces this.)
5. **Commits are Conventional** (`type(scope): subject`), enforced on commit.
6. **Done means the gates are green.** Do not report a task complete until
   `pnpm verify` and `pnpm e2e` pass — see
   `.agents/project/DEFINITION_OF_DONE.md`.
7. **PRs need proof.** Before opening or marking a PR ready, complete the
   pull request template and follow `.agents/project/PR_QUALITY.md`.
8. **Change rules in the open.** If a constraint is wrong, propose an ADR in
   `.agents/decisions/`; don't quietly diverge.

## Where to look

| Need | File |
| --- | --- |
| How the agentic infrastructure is layered | `.agents/project/AGENTIC_INFRASTRUCTURE.md` |
| The pattern to follow | `.agents/project/ARCHITECTURE.md` |
| Naming, imports, errors | `.agents/project/CONVENTIONS.md` |
| When am I done? | `.agents/project/DEFINITION_OF_DONE.md` |
| Which gates run where | `.agents/project/QUALITY_GATES.md` |
| What proof does a PR need? | `.agents/project/PR_QUALITY.md` |
| Which tool owns what | `.agents/project/TECH_STACK.md` |
| Domain language | `.agents/project/GLOSSARY.md` |
| Why a rule exists | `.agents/decisions/` (ADRs) |
| Scaffolds to copy | `.agents/templates/` |

## Safety

- Do not commit secrets; CI runs a secret scan and a dependency audit.
- Do not add a second linter, formatter, or test runner (see `TECH_STACK.md`).
- Treat generated artefacts (`dist/`, `coverage/`, `__stylemaps__/`,
  `graphify-out/`, `.gitnexus/`) as disposable; never edit them by hand.
