# 30. Docs name only guarded paths when they mention sign-off

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Builds on:** [0023](0023-protect-only-the-files-that-run-the-gates.md)

## Context

The enforcement gate decides which files need Ben's sign-off from one table in
`scripts/enforcement-approval.mjs`. Several guidance docs also name those files
in prose. When the table changes, the prose stays as it was, and every check
stays green.

- [ADR 0023](0023-protect-only-the-files-that-run-the-gates.md) (#78) narrowed
  the table to the git hooks, the CI workflows and the lint files. Main at
  `756a823` still says `tsconfig.json` and the scripts need sign-off, in the
  rule table of `.agents/README.md` and in `.agents/project/CONVENTIONS.md`.
- Open #81 carried a sentence in `.agents/CLAUDE_CODE.md` saying edits to
  `.claude/settings.json` and `.claude/hooks/` wait for sign-off. When it
  merged main, its author found the sentence by reading the file and rewrote
  it by hand in `d60d25b`.

An agent reads the nearest doc and repeats it, so a stale claim spreads into
PR bodies and briefs.

## Decision

`pnpm check:docs` also runs `scripts/check-sign-off-docs.mjs`. It reads the same
tracked guidance docs as the phrasing check
([ADR 0021](0021-guidance-docs-state-the-action.md)) and fails when a claim
mentions sign-off and names a path the gate leaves unguarded.

- A claim is one sentence of a paragraph, list item or heading, or one cell of
  a table row. Fenced code is skipped.
- Each path-shaped code span in the claim is checked with the gate's own path
  rules, imported from `scripts/enforcement-approval.mjs`. A folder or glob
  counts as guarded when a file inside it is. A code span that is a link's
  text is judged by the link's target.
- A claim that a file needs no sign-off, or sits outside it, is the opposite
  claim, so it passes.
- The error names the doc, the line and the path, and points to the gate's
  table and the Enforcement approval section of `QUALITY_GATES.md`.

The script reads whichever path function the gate exports:
`classifyProtectedFiles` on main, or `guardedPaths` once #81 lands. The second
of the two to merge can then drop the branch it no longer needs.

## Consequences

- When a PR changes the gate's table, `pnpm verify` and CI show every doc that
  now says the wrong thing, in the same PR.
- The check reads code spans only. Prose such as "hooks, workflows, scripts"
  or "enforcement paths are protected by default" is outside it, so a reviewer
  still reads those lines. `NORTH_STAR.md` holds such lines today; #81 edits
  that file.
- A sentence that mentions sign-off and names an unguarded file for another
  reason fails too. Split the sentence, or write the other file's name outside
  the sentence.
- No dependency, workflow or hook changes.
