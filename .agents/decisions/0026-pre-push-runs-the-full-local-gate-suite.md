# 26. Pre-push runs the full local gate suite

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Amends:** [0002](0002-quality-gates-as-code.md)

## Context

[0002](0002-quality-gates-as-code.md) split the local gates in two. Pre-commit
runs the fast static checks on staged files. Pre-push runs the unit tests, the
build and the E2E map. Between them, every commit was meant to see every check.

A merge from main slips between the two. Git runs `pre-merge-commit`, not
`pre-commit`, when a merge has no conflicts, so typecheck, Biome, Fallow and the
secret scan never see the merged tree. Pre-push then runs only tests, build and
E2E. The merged tree reaches CI with no local lint run at all, at the moment it
is most likely to fail one: main's new code meets the branch's new rules.

It happened twice on 2026-10-17:

- #76 merged main (`b744b61`) cleanly. Its new Biome rule rejects an empty
  block in `journeys.mjs` that #75 had just added to main. The merge commit
  `2b8f584` passed the local hooks and failed `pnpm check` in CI
  (run 39020113690).
- Merging main (`b744b61`) into the head-commit branch (`31672c9`) was clean
  too. Main's Fallow config scores the branch's `collectHeadCommitErrors` above
  the complexity threshold. A replay with the hooks live commits the merge and
  passes main's pre-push. It was caught only because a hook failed for an
  unrelated reason and the merge was finished with `git commit`.

The context-layer checks for ADR numbers and duplicate doc sections have the
same gap: both mistakes appear in merges, and a clean merge reaches them only in
CI.

## Decision

`.husky/pre-push` runs, in order:

1. `sh scripts/require-up-to-date-main.sh --pushed-refs`, unchanged.
2. `pnpm verify`, the full local gate suite, in place of the separate
   `pnpm test:coverage` and `pnpm build` steps it already contains.
3. `pnpm e2e`, unchanged.

That is the Definition of Done, `pnpm verify` and `pnpm e2e`, enforced where
nothing can skip it short of a bypass. Pre-commit stays fast and staged-only.
Anything later added to `pnpm verify` runs at push with no hook edit.

Before `pnpm verify`, the hook clears git's per-repo variables
(`unset $(git rev-parse --local-env-vars)`). Git sets `GIT_DIR` for hooks in a
linked worktree, and the tests that build scratch repos would otherwise write
to the repo being pushed. The old hook ran those tests too, so this closes a gap
it already had.

`scripts/fallow-audit.sh` now prefers `origin/main` as its base, falling back to
local `main` in a clone with no remote. The up-to-date check fetches
`origin/main` and CI compares against it. A stale local `main` would count
main's own new code as the branch's, which is exactly the merge case this ADR
is about.

A `pre-merge-commit` hook was the other option. It would check the merge at
merge time, but it runs before the merge commit exists, so the up-to-date check
would refuse the very merge that brings main in. It also misses rebases,
cherry-picks and amends. Pre-push sees every route to the remote, so it is the
one place to close the gap.

The required-gate contract's local column now names the pre-push hook for the
lanes `pnpm verify` covers, and `docs/required-gates.md` is regenerated from it.

## Consequences

- A clean merge from main is checked locally before it leaves the machine, by
  the same commands CI runs.
- A push takes longer. On a busy 8-core box (load 25), `pnpm verify` took 46 s
  against 14 s for the coverage and build steps it replaces, about half a
  minute more per push before E2E.
- The working tree is what gets checked, as before. A push of a branch other
  than the checked-out one, a tag push or a branch deletion still runs the
  gates on the checkout. An untracked file that fails Biome now fails the push;
  commit it, stash it or delete it first.
- Hosted-only checks (security audit, CodeQL, Lighthouse, the PR body) still run
  only in CI. `Required gates` stays the judge.
