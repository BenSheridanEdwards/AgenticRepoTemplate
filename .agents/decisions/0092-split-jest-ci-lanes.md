# 92. Split Jest CI lanes

- **Status:** Proposed
- **Date:** 2026-11-01

## Context

Tooling fixture tests dominate Jest wall time. Coverage sources include app
and package code. Global, per-result and changed-file coverage gates consume
that coverage. Comparing all projects with web/api alone produced identical
coverage-summary.json and coverage-final.json on this branch.

## Decision

Keep the test job and its Unit + component tests check name. Run web/api
coverage and coverage-by-result there, preserving both coverage artifacts.
Run tooling without coverage in three weighted shards, judged by Required gates through
the single combined tooling needs result. Keep local test:coverage and verify
running all projects with coverage. Use Node as tooling's default environment;
DOM references in tooling tests are fixture text or explicitly configured
child Jest runs.

## Consequences

On this Mac, all-project coverage took 297.31 seconds and app coverage took
5.56 seconds. Tooling without coverage took 165.29 seconds before the Node
default and 158.10 seconds after. Sequential shard measurements were 21.58
and 145.35 seconds; parallel CI can finish at the longer shard's duration
plus setup. These measurements include process startup and reflect local
load and cache state. Hosted timings require a CI run.

Coverage thresholds and fail-closed aggregate decisions remain in force.
This change addresses #247.
