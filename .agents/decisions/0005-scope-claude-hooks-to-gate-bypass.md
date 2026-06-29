# 5. Scope Claude hooks to deterministic gate bypasses

- **Status:** Accepted
- **Date:** 2026-06-29

## Context

Claude Code hooks are useful because they run deterministically before or after
tool events. They can also become noisy if they run for broad events without a
specific reason. This template needs one project hook: block attempts to bypass
the local quality gates with `--no-verify`.

That guard belongs in `PreToolUse` because bypassing a hook is a command-level
decision that can be rejected before it executes. It does not need to observe
every tool call, every file edit, or every shell command.

## Decision

Keep the `block-gate-bypass.sh` hook, but scope it in two layers:

1. `.claude/settings.json` matches the `Bash` tool and uses
   `if: Bash(git *)`, so the hook handler only spawns for Bash commands with a
   git subcommand.
2. `.claude/hooks/block-gate-bypass.sh` inspects the actual hook input and
   blocks only when `--no-verify` appears.

This makes the hook deterministic and narrow: it enforces the one rule that must
never be bypassed, without turning hooks into generic logging or surveillance.

## Consequences

- Ordinary Bash commands do not pay hook process overhead.
- Git commands are inspected only for gate-bypass flags.
- The permission deny list still blocks dangerous git operations separately.
- If future hooks are added, each must name its event, matcher, and command/path
  scope. Broad hooks need a written justification.
