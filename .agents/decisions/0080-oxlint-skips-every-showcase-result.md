# 80. Oxlint skips every showcase result

- **Status:** Proposed
- **Date:** 2026-10-29
- **Follows:** [0059](0059-preserve-recorded-trial-outputs-in-duplication-analysis.md)
  and [0070](0070-vendored-anti-slop-oxlint-rules.md)

## Context

Trial merge-backs restore generated results under `showcase/<id>/`, including
Notes runs. The six Todo ignores in ADR 0070 leave other results exposed to
anti-slop rules added after generation. Ben approved widening the Oxlint ignore
to every showcase result on 29 October 2026.

## Decision

Replace the six named Oxlint ignores with `showcase/**`. Keep the
`showcase/*/*/src/**` override, other ignores, rules and Fallow lists unchanged.

## Consequences

Recorded results keep their generated source when merged back. Oxlint skips
every showcase result; other gates retain their existing scope. Reverting this
change restores the six named Oxlint ignores.
