# 21. Check that each ADR number is used once

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

It kept happening on 2026-10-17. Open PR #74 adds
`0018-dependency-manifests-are-not-enforcement-paths` while a local branch
stack (`feat/react-policy-lint` and the two branches on top of it) adds
`0018-local-eslint-policy-plugin`. This ADR moved from 0018 to 0021 for
the same reason: open work already holds 0018, and the head-commit and
hook-bypass branches above moved to 0019 and 0020.

## Decision

`pnpm check:context` fails when two files in `.agents/decisions/` share a
number. The error names both files and tells the branch that added one to
pick a higher number that no open PR uses. The check cannot see open PRs or
tell which file came from main, so it does not suggest an exact number.

It also fails when:

- a Markdown file in `.agents/decisions/` is not named `NNNN-slug.md`, so a
  typo such as `016-x.md` cannot slip a duplicate past the check;
- an ADR's first line is not the `# N.` title its file name gives it, so a
  renumber is finished in both places;
- an ADR is a symbolic link, the same rule as every other context file.

It does not require the numbers to have no gaps. Open PRs may hold numbers
that are not on main yet, and requiring no gaps would force them to collide
on purpose.

## Consequences

- The clash shows up in `pnpm verify` and in CI on a PR whose branch merges
  main in. Two PRs that both go green against the same main can still land
  one after the other with the same number. The push to main then fails CI,
  and requiring branches to be up to date before merging closes that gap.
- The branch that lands second renumbers its ADR. The fix stays in that branch.
- `.agents/decisions/` is now required to exist.
