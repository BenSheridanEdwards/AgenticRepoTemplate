# 74. The 400-line PR limit applies to stacked migration PRs

- **Status:** Proposed (Ben accepts it)
- **Date:** 2026-10-26
- **Amends:** [0070](0070-vendored-anti-slop-oxlint-rules.md), [0073](0073-adopt-the-typescript-toolchain-standard.md)

## Context

Ben instructed at 21:21 GMT 26 Oct 2026:
"Soften the 400-line PR size limit. Stacked PRs are great for migrations like the Tailwind adoption, but a self-contained change that encompasses a single idea should not be forced under 400 lines. Update the planning and review guidance in both repos so the 400-line guidance applies to stacked migration PRs, while a single coherent change may exceed it when it's one idea. Change nothing else."

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
