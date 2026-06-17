# 4. Agent context lives in `.agents/`; root files stay thin

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Agent instructions tend to sprawl across `CLAUDE.md`, `AGENTS.md`, Cursor rules,
and assorted docs, which then drift out of sync. At the same time, several tools
expect specific entry files (`AGENTS.md`, `CLAUDE.md`). We want one place to
maintain detail and still satisfy those entry points. We also use external skill
libraries (ArchitectPlaybook, Fallow skills, graphify) that are maintained — and
self-improve — in their own repositories.

## Decision

1. **`.agents/` is the single source of repository context.** Architecture,
   conventions, Definition of Done, tech stack, glossary, ADRs, and templates
   all live here.
2. **Root entry files are thin and point inward.** `AGENTS.md` (tool-agnostic)
   and `CLAUDE.md` (Claude-specific) state the rules of engagement and defer to
   `.agents/` for detail. There is one place to edit when the way we work
   changes.
3. **External skills are referenced, not vendored.** `scripts/setup-agentic-toolkit.sh`
   installs them from their source so they stay current; only this repo's *own*
   skills are committed under `.claude/skills/`.

## Consequences

- No drift between three instruction files; detail has exactly one home.
- Adoption is portable: copy `AGENTS.md`, `CLAUDE.md`, and `.agents/` into any
  repo to carry the standards across.
- External skills self-update, but their versions are not pinned in this repo; a
  team needing reproducibility can pin them in the setup script.
