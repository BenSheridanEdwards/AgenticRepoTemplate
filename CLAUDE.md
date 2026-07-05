# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It is the tool-agnostic operating
contract — run commands, golden rules, where context lives. This file adds only
the Claude-Code-specific layer on top.

## The two things this repo demonstrates

1. **Health-check the repo like the playbook would.** Use the
   [ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
   audits to grade architecture, agentic setup, quality gates, and
   non-functionals. This template is built to score well on them.
2. **Keep agent-written code at enterprise quality.** The patterns in
   `.agents/project/ARCHITECTURE.md`, the conventions, and the gates make every
   agent's output consistent. Before claiming work is done, verify the change
   against `.agents/project/DEFINITION_OF_DONE.md`.

## Skills available here

This repo commits its own skills under `.claude/skills/`:

- **`install-agentic-infrastructure`** — install or upgrade the repo guidance,
  local hooks, CI workflows, and PR proof contract in another repository.
- **`build-quality-gates`** — create or audit pre-commit, pre-push, and CI gates.
- **`build-agent-guidance`** — create or update `AGENTS.md`, `CLAUDE.md`,
  `.agents/`, and agent-facing repo standards from current evidence.
- **`run-e2e-tests`** — map a behaviour to a Playwright test and run it.
- **`write-unit-tests`** — Jest + React Testing Library, behaviour-first.
- **`pr-quality-contract`** — prepare proof-backed PRs with local checks,
  visual evidence, latest-sha CI status, risk, and explicit gaps.

Install the external skill libraries once with `pnpm setup:agents`:

- **ArchitectPlaybook** audits — `/pre-audit-setup`, then `/agentic-audit`,
  `/quality-gates-audit`, `/architecture-audit`, `/testing-audit`,
  `/security-audit`, … (the health-check).
- **Fallow** skill — interpreting code-intelligence findings.
- **graphify** — the codebase knowledge graph the audits build on.
- **GitNexus** — local execution-flow and impact index for repo navigation.
- **Ponytail** — shortest-working-diff discipline for coding and review tasks.

## Settings & hooks

`.claude/settings.json` defines a permission allowlist for the project's safe
commands and a **PreToolUse hook** (`.claude/hooks/block-gate-bypass.sh`) that
refuses any git command using `--no-verify`. The hook is deliberately scoped:
Claude Code only spawns it for Bash commands with a `git` subcommand, and the
script blocks only the gate-bypass flag. The gates are not optional — if one
fails, fix the cause.

## The workflow for a change

1. Read `.agents/project/QUALITY_GATES.md` before changing hooks, scripts, CI,
   or tool ownership.
2. Read `.agents/project/AGENTIC_INFRASTRUCTURE.md` before changing guidance,
   hooks, workflows, or skills.
3. Read `.agents/project/ARCHITECTURE.md` + `CONVENTIONS.md`.
4. Use the `run-e2e-tests` / `write-unit-tests` skills; copy from
   `.agents/templates/`.
5. Run `pnpm verify` and `pnpm e2e` until green.
6. Commit with a Conventional Commit message.
7. Use `pr-quality-contract` before opening or marking the PR ready.
8. For a health-check of the whole repo, run the ArchitectPlaybook audits.

## Agent tooling

This repo is wired for Claude Code with three tools:

- **Ponytail** — default lazy-coding mode (global plugin). `/ponytail lite|full|ultra`.
- **GitNexus** — code-intelligence graph. MCP server in `.mcp.json` (`npx -y gitnexus mcp`,
  no global install needed); skills in `.claude/skills/gitnexus/`; index in `.gitnexus/`
  (gitignored). (Re)index with `npx gitnexus analyze`. See the auto-generated
  **GitNexus — Code Intelligence** block below — it is managed by `gitnexus analyze`
  (`<!-- gitnexus:start/end -->`) and rewritten on every re-index; do not hand-edit inside it.
- **Graphify** — `/graphify` builds a navigable knowledge graph under `graphify-out/`
  (gitignored). Use it for architecture and file-relationship questions.

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
