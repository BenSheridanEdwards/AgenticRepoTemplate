# 53. The root pointers name `.agents/START_HERE.md`

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-22
- **Builds on:** [0022](0022-agent-docs-live-in-dot-agents.md), [0049](0049-review-rules-for-bot-reviewers.md)

## Context

Ben asked for every agent doc in `.agents/` and a clean root, with `AGENTS.md`
and `CLAUDE.md` each only a short pointer to `.agents/START_HERE.md`.
Under ADR 0022, `CLAUDE.md` pointed to `AGENTS.md` and imported it,
`AGENTS.md` pointed to `.agents/README.md`, and `AGENTS.md` also carried the
`REVIEW.md` line from ADR 0049. Claude Code reads only `CLAUDE.md` when both
files exist, so `CLAUDE.md` must reach the guide itself.

## Decision

1. **Name the guide `.agents/START_HERE.md`.** Rename `.agents/README.md`
   and keep its text.
2. **Keep both root files as short pointers.** `AGENTS.md` and `CLAUDE.md`
   each only point to the guide, in at most 10 non-empty lines. `CLAUDE.md`
   also imports it with a bare `@.agents/START_HERE.md` line.
3. **Put the review direction in the guide.** The guide carries the sentence
   that sends Codex and Claude to `REVIEW.md`. `.cursor/BUGBOT.md` still sends
   Cursor Bugbot there.
4. **Keep tool-discovered files at the root.** `REVIEW.md` and
   `skills-lock.json` stay there because Claude Code Review and the skills CLI
   read them there. Move `team-walkthrough.html` to `.agents/`.
5. **Enforce points 2 and 3 with `pnpm check:context`.**

This record supersedes points 1 and 2 of ADR 0022 and the `AGENTS.md` wiring
line of ADR 0049. Their other points stand.

## Alternatives considered

- A short `START_HERE.md` index linking the old `README.md`: rejected because
  it adds a hop and a file that only points.
- Keep `@AGENTS.md` in `CLAUDE.md`: rejected because `AGENTS.md` is now only
  a pointer, so Claude would load no rules.
- Move `REVIEW.md` into `.agents/` behind a root pointer: rejected because
  Claude Code Review reads `REVIEW.md` and its includes only at the root.

## Consequences

- Claude Code loads the whole guide at launch, about 160 lines.
- Codex and Cursor still follow one link from `AGENTS.md`.
- GitHub no longer renders an index page for `.agents/`.
- Keep `.agents/README.md` in the trial prompt `tooling/trial/todo-prompt.md`,
  because its hash is pinned by the recorded trials; update it with the next
  trial baseline.
