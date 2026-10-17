# 21. Guidance docs state each rule as the action to take

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The guidance docs mixed two kinds of rule. Some stated the action to take.
Others stated what to skip, with "do not", "never", "avoid", or a leading
"No". A rule phrased as a ban tells an agent what is wrong and leaves it to
guess what is right. A reader catches the old phrasing once, and the next edit
brings it back.

## Decision

- Guidance docs state each rule as the action to take.
- [`scripts/check-doc-phrasing.mjs`](../../scripts/check-doc-phrasing.mjs)
  (`pnpm check:docs`) reads the tracked Markdown guidance: root docs,
  `.agents/`, `.github/`, `docs/`, and `.claude/skills/`. It fails a line that
  contains a phrase such as `do not`, `don't`, `never`, `must not`, `cannot`,
  or `avoid`, or that starts with `No`, and the message asks for the
  positive form.
- The check reads prose only. Code spans, fenced code, link targets, and the
  generated GitNexus block pass. A fence closes only on the marker that opened
  it.
- ADRs are records that are superseded, not edited, so `.agents/decisions/` is
  out of scope. The generated GitNexus skills and the vendored, hash-pinned
  `show-me` skill are out of scope too.
- `pnpm verify`, `scripts/verify-gates.sh`, and the CI quality job run
  `pnpm check:docs`. The script is a repository script with no new dependency.

## Consequences

- A new or vendored guidance doc passes the check before it merges, so a
  change that adds a skill also phrases its rules positively.
- The check reads words, not intent. A description of behaviour that uses a
  listed word ("the count never goes below 0") fails too, and gets rewritten in
  the same positive form.
- Changes to the script are enforcement changes under
  [ADR 0007](0007-protect-enforcement-paths-by-default.md), because `scripts/`
  is a protected path.
