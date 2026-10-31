# 88. Cursor runs the gate-bypass hook

- **Status:** Proposed
- **Date:** 2026-10-31
- **Amends:** [Block the common hook bypasses, not only the long flag](0027-block-common-hook-bypasses.md)

## Context

Claude Code and trusted Codex Bash sessions call the shared gate-bypass guard.
Cursor agents have no equivalent hook in this repo.

## Decision

Register `beforeShellExecution` in `.cursor/hooks.json`. Cursor project hooks
run from the project root in trusted workspaces. The adaptor
`.agents/hooks/cursor-gate-bypass.sh` reads Cursor's top-level `command` and
pipes `tool_input.command` JSON into the unchanged shared guard.

Return `permission: "allow"` when the guard exits zero. On exit two, return
`permission: "deny"` with the guard's stderr in `user_message` and
`agent_message`. Deny malformed input, missing commands and other guard
failures. Set `failClosed: true` so Cursor also blocks crashes and timeouts.
Use the [official Cursor hooks contract](https://cursor.com/docs/agent/hooks).

## Consequences

Tests pipe payloads through the command named by `.cursor/hooks.json` and
assert allow, deny and malformed-input responses. They execute only the hook,
so test payloads never run as shell commands. Trial enforcement includes
`.cursor` alongside the other harness settings.

Cursor-specific gaps remain:

- Project hooks require workspace trust and a Cursor version supporting hooks.
- Commands run outside `beforeShellExecution`, including commands launched by
  other tools or committed scripts, receive no separate shell inspection.
- File edits can alter hooks or git config without shell execution.
- Shell expansion and git plumbing retain the shared guard's documented gaps.

CI repeats the local gates on a clean checkout as the backstop.
