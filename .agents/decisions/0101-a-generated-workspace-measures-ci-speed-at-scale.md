# 101. A generated workspace measures CI speed at scale

- **Status:** Accepted (merged in #279)
- **Date:** 2026-11-01

## Context

The reference workspace has three packages. Claims about skipped work at
enterprise scale need repeatable measurements on a larger workspace.

## Decision

Generate pairs of web and api packages as showcase results in a throwaway
Git archive. Rename each result's scope and preserve its shared dependency
on `@repo/ui`. Use existing workspace globs and architecture roles.

Measure the existing gate commands cold, warm and after a neutral source edit.
Compare a baseline ref with HEAD using the same generator. Keep generated
output outside the repository and remove it unless `--keep` is requested.

In the temporary copy only, append `showcase/bench-*/**` to Fallow's
`duplicates.ignore` and `health.ignore` before committing its main baseline.
Preserve every other configuration byte. These are deliberate reference clones;
real results and reference sources retain their duplication checks.
Setup commits omit hooks; timed commands run the gates unchanged.
Allow a non-frozen offline install only in the throwaway copy.

## Consequences

The benchmark shows independent results sharing UI, with no cross-result fan-in.
Fallow skips duplication checks on generated clones, so its audit time
understates duplication cost at scale. Cold removes tool caches, not dependencies
or operating-system caches. Report machine details with each table.
The dispatch-only workflow publishes its table to the run summary and adds no
required gate. Use SHA-pinned Actions and read-only repository permissions.
