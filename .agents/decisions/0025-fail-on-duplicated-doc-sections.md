# 25. Fail when a merge duplicates a doc section

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-16

## Context

When two branches add the same section at different places in a file, git
keeps both copies and reports no conflict. On 2026-10-16 this happened
twice in `.agents/project/QUALITY_GATES.md`. `build/lint-policy-eslint` and
`ci/fallow-architecture-gate` had each merged the enforcement-approval branch
before #60 was squash-merged to main. Merging main into each branch then
produced two byte-identical `## Enforcement approval` sections. Both times the
agent doing the merge noticed and deleted one by hand. Nothing failed.

## Decision

`pnpm check:context` fails when a tracked context doc has the same heading
twice under the same parent heading. Context docs are the root Markdown
files, everything under `.agents/`, and `.claude/skills/`. The list comes
from `git ls-files`, so a local scratch note cannot fail a check that CI
would pass. The error names the file, the heading, its parent, and the line
numbers. When a whole section with sub-sections is copied, only the
outermost copy is reported.

Front matter and fenced code blocks are skipped. A closing `#` run on a
heading is ignored, so `## A` and `## A ##` count as the same heading. The
same heading under different parents (for example an `### Example` under each
of two sections) is allowed.

## Consequences

- The duplicate shows up in `pnpm verify` and in CI on the merge that made
  it, not in a later review.
- A doc that really needs two sections with one name under one parent has to
  rename one of them.
- A copy that lands under a different parent is not caught. Both real cases
  were under the same parent.
- Setext headings (text underlined with `===` or `---`) and headings inside
  HTML comments are not parsed. No context doc uses them for sections today.
- No tracked context doc on main, or at any main commit since the checker
  was added, has such a duplicate.
