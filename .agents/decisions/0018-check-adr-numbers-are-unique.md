# 18. Check that each ADR number is used once

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-16
- **Enforces:** [0001](0001-record-architecture-decisions.md)

## Context

ADR 0001 numbers ADRs sequentially. Branches that run at the same time each
take "the next" number from the main they started on. Their files get
different names, so git merges both without a conflict, and two ADRs end up
with one number. On 2026-10-16 this happened three times:

- `chore/remove-styleproof` added `0015-pause-styleproof-…` while main took
  `0015-eslint-policy-stack-wiring` (#61). An agent spotted it and renumbered
  the pause ADR to 0016 in the merge.
- A local head-commit branch's `0016-pr-body-names-its-head-commit` now
  clashes with main's `0016-pause-styleproof-…` (#63).
- A local hook-bypass branch's `0017-block-common-hook-bypasses` clashes with
  #64's `0017-required-gates-aggregate`.

Nothing failed in any of them. Each depended on someone noticing.

## Decision

`pnpm check:context` fails when two files in `.agents/decisions/` share a
number. The error names both files and the next free number. It also fails
when an ADR's `# N.` title does not match its file name, so a renumber is
finished in both places.

It does not require the numbers to have no gaps. Open PRs may hold numbers
that are not on main yet, and requiring no gaps would force them to collide
on purpose.

## Consequences

- The clash shows up in `pnpm verify` and in CI on the branch that merges
  main in, which the up-to-date-main gate already requires.
- The branch that lands second renumbers its ADR. The fix stays in that branch.
- An ADR file that does not match `NNNN-slug.md` is not checked.
