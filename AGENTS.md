# AGENTS.md

> The operating contract for **any** agent (or engineer) working in this repo.
> It is tool-agnostic and follows the [agents.md](https://agents.md) convention:
> write for the agent — concrete commands, explicit rules, no tribal knowledge.
> `CLAUDE.md` adds the Claude-Code-specific layer on top of this file, and
> [`agents/openai.yaml`](agents/openai.yaml) is the vendor-neutral manifest for
> OpenAI-family agents — both defer to this file and the `.agents/` docs.

## What this repo is

A reference scaffold for **agentic engineering**: the files, gates, and context
that make AI-written code consistent and enterprise-grade. TypeScript + React is
just the runnable carrier — the scaffolding is the point (see `README.md`).

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

1. **Read `.agents/` before you write.** Architecture, conventions, the
   Definition of Done, the glossary, and ADRs live there.
2. **Follow the patterns; copy the templates.** New files come from
   `.agents/templates/`. Consistency is the deliverable.
3. **Behaviour is defined by the E2E map** (`e2e/app.spec.ts`), not by the
   implementation. Add behaviour there first.
4. **When a gate fails, fix the cause.** Keep every gate and its config as it
   is; the checks below enforce this.
5. **Done means the gates are green.** Report a task complete once
   `pnpm verify` and `pnpm e2e` pass; see
   `.agents/project/DEFINITION_OF_DONE.md`.
6. **PRs carry proof.** Complete the pull request template and follow
   `.agents/project/PR_QUALITY.md` before opening a PR or marking it ready.
7. **Change rules in the open.** When a constraint is wrong, propose an ADR in
   `.agents/decisions/` and change the rule there.

## Rules and what enforces them

Each rule below fails a check when it is broken, so the check's message is the
first place to look. `.agents/project/CONVENTIONS.md` lists the code-level
rules and their checks.

| Rule | Enforced by |
| --- | --- |
| Commits, PR titles, and branch names follow Conventional Commits. | commitlint on `commit-msg`; `PR quality` workflow |
| Every hook runs; `--no-verify` is refused. | `.claude/hooks/block-gate-bypass.sh` (Claude Code); CI re-runs every gate |
| Gate config (`tsconfig.json`, `biome.json`, `eslint.config.js`, hooks, workflows, scripts) changes with a maintainer's sign-off. | `enforcement-approval` status ([ADR 0007](.agents/decisions/0007-protect-enforcement-paths-by-default.md)) |
| Done means every gate is green on the latest commit. | `Required gates` and the checks in `docs/required-gates.md` |
| A PR body keeps the template sections and carries inline proof. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with an ADR. | `pnpm check:adr` |
| Secrets stay out of commits. | gitleaks in pre-commit and CI |
| Every lint or type suppression names its rule and its reason. | `pnpm check:suppressions`; Biome for `biome-ignore` |
| Generated files match their source. | `pnpm arch:check`, `pnpm gates:check`, `pnpm api:check` |
| Guidance docs state rules as the action to take. | `pnpm check:docs` |

## Simplicity Mode

Use Ponytail for coding, review, refactor, and design tasks unless the user says
otherwise. Default level: `full`: delete code, reuse existing patterns, and use
stdlib or native platform features before adding abstractions or dependencies.

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

- Keep secrets out of commits; CI runs a secret scan and a dependency audit.
- Keep one owner per concern: Biome formats and runs general lint, ESLint runs
  policy and React rules, Jest and Playwright run tests. A new tool for an owned
  concern needs an ADR (see `TECH_STACK.md`); `pnpm check:adr` fails a new
  dependency that no new ADR names.
- Treat generated artefacts (`dist/`, `coverage/`, `graphify-out/`,
  `.gitnexus/`) as disposable; regenerate them with their command.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MergeProof** (134 symbols, 144 relationships, 1 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/MergeProof/context` | Codebase overview, check index freshness |
| `gitnexus://repo/MergeProof/clusters` | All functional areas |
| `gitnexus://repo/MergeProof/processes` | All execution flows |
| `gitnexus://repo/MergeProof/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
