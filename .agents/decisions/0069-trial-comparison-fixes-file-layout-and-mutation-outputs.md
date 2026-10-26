# 69. Fix file layout and mutation outputs in trial comparisons

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-25
- **Amends:** [0035](0035-trial-comparison.md)

## Context

The [North Star](../NORTH_STAR.md) asks independent agents given the same
brief to build the app the same way. The 23 October trials passed all six
runs, but their comparison called different file layouts, component
boundaries and mutation outputs consistent through freedoms 2 and 4 of
ADR 0035. Those freedoms hide differences the identical-build proof needs
to expose.

## Decision

Revoke freedoms 2 and 4 for trial comparisons. Require the same source-file
layout and component and hook boundaries within each feature role, and the
same create, toggle and delete output shapes. Classify differences in these
aspects as `outside-spec`; reject author rulings that cite either revoked
freedom. Keep the historical freedom text and every other classification
rule unchanged, and mark the revoked freedoms in the report's Method table.

Write `docs/trials/comparison.md` before deciding the CLI exit status.
Exit 0 only when the verdict is `consistent`, the baseline is shared and
every run passed. Otherwise exit 1 and print the reasons, including the
outside-spec aspects, so callers can observe the failure and read its report.

## Consequences

Regenerate the report from the unchanged 23 October records: 6/6 runs
passed, with an `inconsistent` verdict, four aspects outside the spec and
eight differences inside a remaining freedom. The four aspects are
`files web-routes`, `components web-routes`, `toggle output` and
`delete output`. Preserve the recorded outputs as evidence.

Keep the committed-report freshness test: it checks that the report matches
the records, independently of the verdict. No required CI check currently
gates that verdict. Propose a separate CI verdict gate for Ben to consider;
this decision changes the comparator and its CLI only. Add behavioural tests
for the revoked freedoms, author rulings, exit status and retained freedoms.
