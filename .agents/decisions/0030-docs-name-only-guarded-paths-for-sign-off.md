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
- #81 carried a sentence in `.agents/CLAUDE_CODE.md` saying edits to
  `.claude/settings.json` and `.claude/hooks/` wait for sign-off. When it
  merged main, its author found the sentence by reading the file and rewrote
  it by hand in `d60d25b`.

An agent reads the nearest doc and repeats it, so a stale claim spreads into
PR bodies and briefs.

## Decision

`pnpm check:docs` also runs `scripts/check-sign-off-docs.mjs`. It reads the same
tracked guidance docs as the phrasing check
([ADR 0021](0021-guidance-docs-state-the-action.md)), shares its fence and
prose helpers, and fails when a claim mentions sign-off and names a path the
gate leaves unguarded.

- A claim is one sentence or `;` clause of a paragraph, list item or heading,
  or one cell of a table row. Fenced code and the generated GitNexus block are
  skipped. "Sign-off", "sign off", "signs off" and "signed off" all count.
- Each path-shaped code span in the claim is checked with the gate's own path
  rules, through the `guardedPaths` function that
  `scripts/enforcement-approval.mjs` exports. A linked code span is judged by
  its link target. A folder or glob is guarded when every tracked file it
  covers is guarded, so `.husky` and `eslint.config.*` pass and `scripts/`
  fails. In a glob, `**/` matches zero or more folders, so `.github/**/*.yml`
  covers `.github/ci.yml` as well as the workflows.
- A claim that a file needs no sign-off, goes without it, or sits outside it
  passes. Markdown files and the gate's own script are references to the gate,
  so they pass too.
- The error names the doc, the line of the claim, and the path, and points to
  the gate and the Enforcement approval section of `QUALITY_GATES.md`.

### Alternative considered

Generate the guarded list into one doc block from the gate's table, as
`pnpm gates:inventory` does for `docs/required-gates.md`, and check that block.
That keeps one list right, but both mistakes above were sentences in other
docs, which a generated block leaves as they are. A generated block can still
be added later; this check would then keep the other docs pointing at it.

## Consequences

- When a PR changes the gate's table, `pnpm verify` and CI show every doc that
  now says the wrong thing, in the same PR.
- The check reads claims that name files in code spans. These shapes are
  outside it, so a reviewer still reads them:
  - prose names such as "hooks, workflows, scripts", or "enforcement paths are
    protected by default" (`NORTH_STAR.md` holds such lines);
  - "approval" in place of "sign-off";
  - a table whose header says "Needs sign-off", or a heading or lead-in
    sentence followed by a list of files;
  - a claim that says both "needs sign-off" and "without sign-off";
  - HTML `<code>`.
- A sentence that mentions sign-off and names an unguarded file for another
  reason fails too. Split the sentence, or move the other file's name out of
  it.
- No dependency, workflow or hook changes.
