# Claude Code

The Claude Code layer on top of the [start-here guide](README.md). Read that
first.

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
- **`show-me`** — create the smallest grounded visual explanation that removes
  review ambiguity from a non-trivial PR.
- **`verify-agentic-template`** — launch the app, drive it in Chromium like a
  user, and capture screenshots, ARIA snapshots, and video as PR proof.

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

This repo is wired for Claude Code with four tools:

- **Ponytail** — default lazy-coding mode (global plugin). `/ponytail lite|full|ultra`.
- **GitNexus** — code-intelligence graph. MCP server in `.mcp.json` (`npx -y gitnexus mcp`,
  no global install needed); skills in `.claude/skills/gitnexus/`; index in `.gitnexus/`
  (gitignored). (Re)index with `npx gitnexus analyze --skip-agents-md`. How to
  use it is in [`GITNEXUS.md`](GITNEXUS.md).
- **Graphify** — `/graphify` builds a navigable knowledge graph under `graphify-out/`
  (gitignored). Use it for architecture and file-relationship questions.
- **Show Me** — `/show-me` creates a concise visual explanation of a change.
  Use it selectively on non-trivial PRs. Ground every label in real files,
  symbols, states, or evidence. It supports the PR proof and never replaces
  tests, screenshots, or exact-head CI. Read
  `.claude/skills/show-me/REPOSITORY.md` with the upstream skill.
