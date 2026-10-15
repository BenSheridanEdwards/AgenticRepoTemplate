# 9. Move the app to `apps/web` first

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

Several enforcement PRs name single-app paths: `src/routes/`, the Fallow zones
in `.fallowrc.jsonc`, and the Jest roots. The monorepo moves the app under
`apps/web`. Building those paths before the move would mean writing them twice.

## Decision

The first PR moves the current app into a pnpm workspace at `apps/web` with
behaviour unchanged. The nine enforcement PRs then target `apps/web`.
`apps/api` and `packages/ui` follow.

## Consequences

- Every path glob in the enforcement PRs is written once, against the final
  layout.
- The move PR is mechanical, so the existing behaviour map proves it: the same
  tests pass before and after.
- The move happens ahead of the protected-path detector
  ([0007](0007-protect-enforcement-paths-by-default.md)), so it is reviewed by
  hand.
