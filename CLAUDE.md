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

## Settings & hooks

`.claude/settings.json` defines a permission allowlist for the project's safe
commands and a **PreToolUse hook** (`.claude/hooks/block-gate-bypass.sh`) that
refuses any command using `--no-verify`. The gates are not optional — if one
fails, fix the cause.

## The workflow for a change

1. Read `.agents/project/AGENTIC_INFRASTRUCTURE.md` before changing guidance,
   hooks, workflows, or skills.
2. Read `.agents/project/ARCHITECTURE.md` + `CONVENTIONS.md`.
3. Use the `run-e2e-tests` / `write-unit-tests` skills; copy from
   `.agents/templates/`.
4. Run `pnpm verify` and `pnpm e2e` until green.
5. Commit with a Conventional Commit message.
6. Use `pr-quality-contract` before opening or marking the PR ready.
7. For a health-check of the whole repo, run the ArchitectPlaybook audits.
