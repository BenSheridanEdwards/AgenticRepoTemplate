# 6. Gap-review decision set for the enforcement plan

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The enforcement plan turns the agent guardrails into mechanical checks across
nine pull requests. A gap review of that plan raised eight questions about
protected paths, the monorepo, lint ownership, Effect, state, structure, and
architecture checks. Ben settled all eight on 2026-10-15. This record indexes
the outcome so each later enforcement PR can cite one decision.

## Decision

The eight decisions each have their own ADR:

| Decision | ADR |
| --- | --- |
| D1. Enforcement paths are protected by default | [0007](0007-protect-enforcement-paths-by-default.md) |
| D2. This template becomes the reference monorepo | [0008](0008-convert-template-into-the-monorepo.md) |
| D3. The monorepo move lands first | [0009](0009-move-the-app-to-apps-web-first.md) |
| D4. Lint engines own disjoint concerns | [0010](0010-lint-engine-ownership.md) |
| D5. Effect Schema validates every boundary | [0011](0011-effect-schema-everywhere.md) |
| D6. Local state lives inside custom hooks | [0012](0012-local-state-inside-custom-hooks.md) |
| D7. One role table defines the structure | [0013](0013-one-role-table-for-structure.md) |
| D8. Fallow owns the architecture graph, gate, and diagram | [0014](0014-fallow-owns-architecture-checks.md) |

### Enforcement plan scope

The enforcement plan keeps all nine PRs. That includes PR 8
(enforcement-change detection) and PR 9 (checkbox approval with an audit
trail).

These items sit outside the plan and need no further work:

- the new-file rule
- the trials harness
- agent identity
- the approval-check decision
- the guardrails PR form

### Delivery order

1. This decision set.
2. The monorepo move to `apps/web` ([0009](0009-move-the-app-to-apps-web-first.md)).
3. Plan PR 1, then the protected-path detector
   ([0007](0007-protect-enforcement-paths-by-default.md)), so later PRs are
   gated.
4. Plan PRs 2 to 7 in their existing order, with the Effect PR ahead of PR 3
   ([0011](0011-effect-schema-everywhere.md)).
5. Plan PRs 8 and 9.

## Consequences

- Every enforcement PR has a settled decision to build against.
- Docs that still describe the earlier setup are updated by the enforcement PR
  that changes the matching behaviour. Each ADR names that PR.
