# Claude Code

The Claude Code layer on top of the [start-here guide](../AGENTS.md). Read that
first.

## The two things this repo demonstrates

1. **Health-check the repo like the playbook would.** Use the
   [ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
   audits to grade architecture, agentic setup, quality gates, and
   non-functionals. This template is built to score well on them.
2. **Keep agent-written code at enterprise quality.** The patterns in
   `.agents/project/ARCHITECTURE.md`, the conventions, and the gates make every
   agent's output consistent. Before claiming work is done, verify the change
   against `.agents/project/PR_QUALITY.md`.

## Skills available here

This repo commits its own skills under `.claude/skills/`:

- **`adopt-the-factory`** — adopt or audit the repo guidance, local gates,
  CI workflows, and PR proof contract in another repository.
- **`run-e2e-tests`** — map a behaviour to a Playwright test and run it.
- **`write-unit-tests`** — Jest + React Testing Library, behaviour-first.
- **`pr-quality-contract`** — prepare proof-backed PRs with local checks,
  inline screenshots, risk, and explicit gaps.
- **`show-me`** — create the smallest grounded visual explanation that removes
  review ambiguity from a non-trivial PR.
- **`verify-agentic-template`** — launch the app, drive it in Chromium like a
  user, and capture screenshots, ARIA snapshots, and video as PR proof.

Install external skill libraries separately; see the README for Fallow and Ponytail:

- **ArchitectPlaybook** audits — `/pre-audit-setup`, then `/agentic-audit`,
  `/quality-gates-audit`, `/architecture-audit`, `/testing-audit`,
  `/security-audit`, … (the health-check).
- **Fallow** skill — interpreting code-intelligence findings.
- **Ponytail** — shortest-working-diff discipline for coding and review tasks.

## Settings & hooks

`.claude/settings.json` defines a permission allowlist for the project's safe
commands and a **PreToolUse hook** (`.claude/hooks/block-gate-bypass.sh`) that
refuses the common ways to switch the git hooks off: `--no-verify`,
`git commit -n`, `HUSKY=0`, and writes to `core.hooksPath`, git aliases, or
config includes. The hook is deliberately scoped: Claude Code only spawns it for
Bash commands that run `git`, `env`, `sh`, or `bash`, and the script blocks only
gate bypasses (ADR 0005, amended by 0027). It is a speed bump, not a sandbox;
CI on a clean checkout is the backstop. Every gate counts: when one fails, fix
the cause.
`.claude/` sits outside the `enforcement-approval` sign-off
([ADR 0023](decisions/0023-protect-only-the-files-that-run-the-gates.md)), so a
change to its settings or hooks is caught in review of the diff.

## The workflow for a change

1. Read `.agents/project/QUALITY_GATES.md` before changing hooks, scripts, CI,
   or tool ownership.
2. Read `.agents/project/AGENTIC_INFRASTRUCTURE.md` before changing guidance,
   hooks, workflows, or skills.
3. Read `.agents/project/ARCHITECTURE.md` + `CONVENTIONS.md`.
4. Use the `run-e2e-tests` / `write-unit-tests` skills; copy from
   `.agents/templates/`.
5. Run `pnpm verify` and `pnpm e2e` until green. The anti-slop commands are
   `pnpm lint:anti-slop`, `pnpm lint:anti-slop:advisory` and
   `pnpm lint:anti-slop:changed`; follow the
   [before-push workflow](../AGENTS.md#before-you-push).
6. Commit with a Conventional Commit message.
7. Use `pr-quality-contract` before opening or marking the PR ready.
8. For a health-check of the whole repo, run the ArchitectPlaybook audits.

When reviewing, Claude Opus runs `pnpm lint:anti-slop:changed` on the PR head
and raises each finding as a change request under
[`REVIEW.md`](../REVIEW.md#anti-slop-findings).

## Agent tooling

This repo is wired for Claude Code with these tools:

- **Ponytail** — default lazy-coding mode (global plugin). `/ponytail lite|full|ultra`.
- **Show Me** — `/show-me` creates a concise visual explanation of a change.
  Use it selectively on non-trivial PRs. Ground every label in real files,
  symbols, states, or evidence. It supports the PR proof alongside tests,
  screenshots, and exact-head CI. Read
  `.claude/skills/show-me/REPOSITORY.md` with the upstream skill.
