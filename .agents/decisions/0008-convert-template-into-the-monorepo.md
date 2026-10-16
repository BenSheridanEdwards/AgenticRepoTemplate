# 8. Convert this template into the reference monorepo

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The monorepo brief calls for a reference monorepo with one small feature. This
template already carries the gates, guidance, and skills the monorepo needs,
plus two demo features, `threshold-counter` and `service-status`.

## Decision

This template converts into the reference monorepo. The two demo features,
`threshold-counter` and `service-status`, are removed as part of the
conversion.

## Consequences

- One repository carries the gates, the guidance, and the monorepo shape, so
  nothing has to be copied across.
- The behaviour map and unit tests for the two demo features go with them. The
  new reference feature brings its own.
- The move itself is sequenced by [0009](0009-move-the-app-to-apps-web-first.md).
