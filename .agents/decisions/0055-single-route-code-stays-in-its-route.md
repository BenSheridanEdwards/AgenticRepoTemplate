# 55. Keep single-route web code in its route

- **Status:** Proposed
- **Date:** 2026-10-23
- **Amends:** [0033](0033-result-diagrams-and-structure-validation.md)
- **Builds on:** [0035](0035-trial-comparison.md),
  [0054](0054-domain-rules-in-application-and-a-fixed-api-client-surface.md)

## Context

The first Colima batch on scaffold `de6622e` passed all six trials. Its
unchanged comparison nevertheless reports six aspects outside the spec.
Claude kept the reference's `PageHeader` feature; Codex kept its UI within
the Todo route. Both placements passed the existing gates. The reference
therefore taught a sharing boundary even though it had only one route.

The three original aspects addressed by ADR 0054 now match. These six new
aspects all follow from the same feature placement:

| Comparison aspect | Difference caused by the header feature |
| --- | --- |
| Role presence | Only Claude has `web-features`. |
| Dependency edges | Only Claude has `web-routes --> web-features`. |
| Files outside roles | Only Claude has the feature API report. |
| Public exports | Only Claude has a `web:web-features` surface. |
| Feature component invariant | The header is outside the permitted route/UI roles. |
| Components by role | Only Claude has a component in `web-features`. |

The complete batch remains in commit `f19786a`. Its records also show a
separate baseline problem: Codex persisted project trust entries and fetched
plugin payloads after the harness captured its configuration fingerprint.
Those recorded fingerprints remain evidence of that run; they are not edited.

## Decision

Add the structure rule `single-route-features`. For each result, including
the reference, count distinct `web/src/routes/<route>/` slices containing
production role source. When that count is exactly one, reject every
path under `web/src/features/` and every `web/etc/features-*.api.md` report.
The finding names the route and instructs the author to move the code there
and remove the obsolete feature barrel and report.

Tests, type declarations and notes do not create another route. Nested files
within the same route still count once. Multiple production route slices
retain the existing ability to share a web feature; this check does not prove
that a feature in a multi-route result has multiple consumers. Existing
required-role and dead-code checks continue to apply.

Reject orphan feature reports too. API report freshness checks regenerate
reports for existing barrels, but do not reject an obsolete report after its
barrel is removed. A single-route result must remove both.

Move the reference's unchanged `PageHeader` component and its test into
`routes/greeting/`, update its local import, remove the feature barrel/report
and regenerate its diagram. The rendered greeting remains the same.

The rule runs in `pnpm arch:gate`, hence in `pnpm verify` and each trial's
clean-checkout checks. Tests cover reference and showcase results, orphan
reports, route counting, multi-route acceptance and the real Fallow-backed
structure CLI. All nine new negative assertions failed before adding the
rule; the complete structure and comparison suites pass afterward.

## Consequences

- Remove the first Colima batch from the live baseline in a separate commit,
  retain its original records, streams and result refs, then run all six
  trials from one new scaffold revision. Every attempt remains accounted for.
- Start each trial with a fresh copy of the same initialized per-agent home
  snapshot. Supply credentials separately at runtime. The harness records
  the real configuration fingerprints; any new drift remains a finding.
- The harness, bubblewrap confinement, prompts, comparison code, freedoms
  and author rulings remain unchanged for this rerun. The new rule tightens
  the demonstrated placement gap without exempting any comparison aspect.
- Keep PR #127 draft until the six replacement records share the required
  baseline and the regenerated comparison is consistent with zero aspects
  outside the spec. ADR 0054 and its paired exemption have Ben's recorded
  approval; this additional decision remains proposed for review.
