# 11. Effect Schema validates every boundary

- **Status:** Accepted, amended by [0036](0036-effect-4.md)
- **Date:** 2026-10-15

## Context

The plan adds React Hook Form and tRPC, and both need a schema library. Using
one schema library everywhere keeps a single validation idiom in the guidance.
React Hook Form and tRPC v11 both accept Effect Schema through Standard Schema
(`effectTsResolver` and `Schema.standardSchemaV1`).
[`ARCHITECTURE.md`](../project/ARCHITECTURE.md) keeps business logic as plain
pure functions.

## Decision

- **Effect Schema** is the one schema library. It validates React Hook Form
  forms, tRPC inputs, and every other parse at a boundary.
- **The Effect runtime** is used at integration boundaries, where a call talks
  to the outside world. Domain logic stays plain pure functions.
- The Effect PR lands before plan PR 4 (TanStack Query and React Hook Form).

## Consequences

- Plan PR 4 builds its first form on Effect Schema from the start.
- Agents learn one validation idiom across web forms and API inputs.
- Iteration inside Effect code uses `Effect.forEach` and `Effect.gen`, which
  fits the loop ban.
