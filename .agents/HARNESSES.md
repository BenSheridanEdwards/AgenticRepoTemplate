# Harness guide

Read [AGENTS.md](../AGENTS.md) for the operating contract. This guide maps
harness entry points, settings, hooks, and skills to their owners.

## Which file each harness reads

| Harness | Entry point |
| --- | --- |
| Codex | Root `AGENTS.md`, with nearer instructions for subdirectories. |
| Claude Code | `.claude/CLAUDE.md` imports `AGENTS.md` with `@../AGENTS.md`. |
| Claude Code Review | Root `REVIEW.md` includes the adjacent `AGENTS.md`. |
| Cursor | Root and nested `AGENTS.md`; `.cursor/hooks.json` guards shell commands; Bugbot reads `.cursor/BUGBOT.md`, which points to `REVIEW.md`. |
| GitHub Copilot | `AGENTS.md`; code review also reads root `REVIEW.md`. |
| VS Code Chat | Root `AGENTS.md` with `chat.useAgentsMdFile` enabled (the default). |
| Gemini CLI | Configure `context.fileName` to read `AGENTS.md`; this repo has no Gemini settings. |
| OpenCode | `AGENTS.md`, walking up the directory tree; file references require an explicit read. |

Keep `AGENTS.md` and `REVIEW.md` at root for discovery. The context check
verifies the Claude import and the AGENTS/REVIEW/BUGBOT wiring.

## Settings and hook

`.claude/settings.json` holds the command permission allowlist and a PreToolUse
hook for Bash commands running `git`, `env`, `sh`, or `bash`.
`.codex/hooks.json` calls the same `.agents/hooks/block-gate-bypass.sh` guard
for Bash in Codex sessions that trust and enable project hooks.
`.cursor/hooks.json` runs `.agents/hooks/cursor-gate-bypass.sh` before shell
execution in trusted workspaces. It adapts Cursor JSON to the shared guard
and returns allow or deny; hook failures block commands.

The guard refuses `--no-verify`, `git commit -n`, `HUSKY=0`, and writes to
`core.hooksPath`, git aliases, or config includes. Its scope and gaps are in
[ADR 0027](decisions/0027-block-common-hook-bypasses.md), amending
[0005](decisions/0005-scope-claude-hooks-to-gate-bypass.md). Cursor wiring and
gaps are in [Cursor runs the gate-bypass hook](decisions/0088-cursor-runs-the-gate-bypass-hook.md).
CI on a clean checkout remains the backstop. Review changes to `.claude/` settings and hooks;
they sit outside enforcement sign-off.

## Skills

The repo's skills live under `.agents/skills/`. Codex reads that source;
Claude Code reads the tracked byte copy in `.claude/skills/`.

Edit skills in `.agents/skills/`, run `pnpm skills:sync`; `pnpm check:context` fails when `.claude/skills/` differs.

- `adopt-the-factory`: adopt or audit guidance, gates, CI, and PR proof in another repo.
- `ponytail`: (optional) the simplicity discipline as a skill.
- `run-e2e-tests`: map a behaviour to a Playwright test and run it.
- `write-unit-tests`: test behaviour with Jest and React Testing Library.
- `pr-quality-contract`: prepare PR proof, local checks, inline screenshots, risk, and gaps.
- `show-me`: explain a non-trivial PR visually, grounding labels in files, symbols, states, or evidence. Read its `REPOSITORY.md` alongside the upstream skill.
- `verify-agentic-template`: drive the app in Chromium and capture screenshots, ARIA snapshots, and video.

Install external skills separately. Fallow helps interpret code-intelligence
findings.

## Layer model

| Layer | Owner and purpose |
| --- | --- |
| Tool import | `.claude/CLAUDE.md` loads the operating contract. |
| Entry contract | `AGENTS.md` holds shared rules and the context map. |
| Harness guide | `.agents/HARNESSES.md` maps tool entry points, settings, hooks, and skills. |
| Project context | `.agents/project/` holds durable engineering standards and facts. |
| Decisions | `.agents/decisions/` records why standards exist and when they changed. |
| Templates | `.agents/templates/` supplies starting points for code and tests. |
| Local gates | `.husky/` and `scripts/` give feedback before commit and push. |
| Remote gates | `.github/workflows/` verifies each PR from a clean checkout. |
| Skills | `.agents/skills/` holds reusable workflows. |

Keep each rule in its owning layer and link to it elsewhere. Use
`adopt-the-factory` to install these layers in another repo. For anti-slop,
[AGENTS.md](../AGENTS.md#before-you-push) owns the builder workflow,
[REVIEW.md](../REVIEW.md#anti-slop-findings) owns review responses, and
`vendor/anti-slop/UPSTREAM.md` records the pinned, hash-checked source.
