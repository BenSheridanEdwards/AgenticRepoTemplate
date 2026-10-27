# 22. Every agent doc lives in `.agents/`; the root files only point

- **Status:** Accepted; points 1 and 2 superseded by [0053](0053-root-pointers-name-start-here.md)
- **Date:** 2026-10-17

## Context

[ADR 0004](0004-agent-context-lives-in-dot-agents.md) put the detail in
`.agents/` but kept the operating contract in `AGENTS.md` and the Claude layer
in `CLAUDE.md`. Agent docs still sat at the root: `AGENTS.md`,
`CLAUDE.md`, `NORTH_STAR.md` and `agents/openai.yaml`.
GitNexus wrote the same 50-line block into both `AGENTS.md` and `CLAUDE.md`.
An agent had to read two root files to find out where to start.

## Decision

1. **Two root files, both pointers.** `CLAUDE.md` points to `AGENTS.md`, and
   imports it with `@AGENTS.md` so Claude Code loads it. `AGENTS.md` points to
   `.agents/README.md`. Neither carries rules.
2. **`.agents/README.md` is the start-here guide.** It holds what `AGENTS.md`
   used to: what the repo is, the commands, the golden rules, and a map of
   everything else in `.agents/`.
3. **Every other agent doc moves into `.agents/`:** `CLAUDE_CODE.md` (the
   Claude Code notes), `GITNEXUS.md` (the GitNexus guidance), `NORTH_STAR.md`
   and `openai.yaml`.
4. **GitNexus re-indexes with `--skip-agents-md`**, so it no longer rewrites
   the root pointers.

`pnpm check:context` enforces the chain: `CLAUDE.md` defers to `AGENTS.md`,
`AGENTS.md` names `.agents/README.md`, and the start-here guide is substantive.

This record supersedes point 2 of ADR 0004. Points 1 and 3 stand.

## Consequences

- An agent reads one short file at the root and lands in `.agents/`.
- Agents that load only `AGENTS.md` see a pointer, not the rules. They must
  follow the link; the rules are one hop away.
- A plain `gitnexus analyze` re-adds its block to the root files. Re-index with
  the flag, and copy any new generated guidance into `.agents/GITNEXUS.md`.
