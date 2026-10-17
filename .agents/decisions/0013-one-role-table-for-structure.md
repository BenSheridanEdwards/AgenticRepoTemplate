# 13. One role table defines the structure

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The structure docs described three shapes: features only, features plus
`src/routes/`, and the monorepo with `apps/web` and `packages/ui`. They also
disagreed on whether one route may import another.

## Decision

- [`ARCHITECTURE.md`](../project/ARCHITECTURE.md) holds one table that maps
  each role to its folder, its allowed imports, and the Fallow zone that
  enforces it.
- Routes compose pages. Routes import features and UI primitives, and never
  import another route.
- Shared code lives in a feature or in the UI package (`packages/ui`).

## Consequences

- An agent placing a file reads one table and knows where it goes and what it
  may import.
- Fallow zones mirror the table, so the table and the gate stay in step
  ([0014](0014-fallow-owns-architecture-checks.md)).
- Plan PR 3 rewrites `ARCHITECTURE.md` around the table when it adds routes.
