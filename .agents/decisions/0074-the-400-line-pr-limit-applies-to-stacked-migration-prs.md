# 74. The 400-line PR limit applies to stacked migration PRs

- **Status:** Accepted (merged in #182)
- **Date:** 2026-10-26
- **Amends:** [0070](0070-vendored-anti-slop-oxlint-rules.md), [0073](0073-adopt-the-typescript-toolchain-standard.md)

## Context

The maintainer decided on 26 Oct 2026 to soften the 400-line PR size limit:
the limit applies to each PR of a stacked migration, and a single coherent
change may exceed it when it is one idea.

## Decision

Apply the 400-changed-line limit to each PR of a stacked migration: a
multi-PR migration split into reviewable steps, such as vendoring, the
TypeScript toolchain adoption or the Tailwind adoption. Keep the counting
rules in ADRs 0070 and 0073 unchanged, including ADR 0070's lockfile treatment.

A self-contained change that is one coherent idea may exceed 400 changed
lines. Its PR body says in one sentence why it is one idea.

## Consequences

Planning and review distinguish migration steps from a single coherent change.
No CI check enforces PR size; this decision changes guidance only.
