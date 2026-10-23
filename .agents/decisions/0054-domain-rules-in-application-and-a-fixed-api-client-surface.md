# 54. Put domain rules behind application and pin scaffold API exports

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-23
- **Amends:** [0032](0032-api-ui-greeting-and-contract.md) (role table),
  [0033](0033-result-diagrams-and-structure-validation.md) (structure checks)
- **Implements:** [0035](0035-trial-comparison.md) (fixed scaffold surfaces)
- **Builds on:** [0037](0037-type-only-edges-and-flagged-re-exports.md)

## Context

The six Todo results at `cb999fc` compare as `inconsistent`, with three
aspects outside the spec. In `todo-02` and `todo-03`, integrations calls the
domain's creation and toggle rules while application imports only the domain
type. The other four results call domain rules from application and import
only domain types in integrations. Both placements pass the old role table,
which permits application and integrations to import domain by value.

The api-client barrel also varies: `todo-01` and `todo-03` dropped
`RouterInputs`, and `todo-codex-01` dropped both `RouterInputs` and
`RouterOutputs`. These are scaffold exports under ADR 0035. Fallow can flag a
router type re-export as unused when a route uses only the other type, but the
three streams hold no matching finding that would qualify their differences
for ADR 0037's freedom 9.

The reference already supplies the intended layering: its application calls
`formatGreeting` from domain. Architecture guidance describes integrations
as storage and application as the caller of domain rules and integrations.
Executable constraints make that placement consistent across runs.

## Decision

**Integrations imports domain by type only.** Move `api-domain` from the
`api-integrations` rule's `allow` to `allowTypeOnly` in `.fallowrc.jsonc`.
Fallow fails a value crossing in `pnpm arch:gate` and `pnpm fallow:audit`.
Storage persists domain values using their types; application owns calls to
the domain's rules, so replacing storage leaves those rules independent.
The canonical role diagram loses the integrations-to-domain value edge.

**Application has a value crossing to its own domain.** The structure rule
`application-without-domain-rule` checks every api feature that has both
application and domain source files. At least one application import or
re-export must resolve to a domain file in that same feature and bring in a
value. This also covers `application/` and `domain/` folders. Missing roles
remain the responsibility of `missing-role`.

Fallow supplies resolved file edges. `tooling/architecture/imports.mjs`
classifies their source references using TypeScript's syntax parser, sharing
the existing ADR 0037 implementation with `tooling/trial/result-facts.mjs`.
`import type`, all-type named import specifiers, `export type` and all-type
named re-export specifiers bring in types only. The comparison keeps its
existing interpretation. This rule proves the value crossing; feature tests
prove the rules' behavior.

**Scaffold API reports match the reference.** The structure rule
`scaffold-exports` compares sorted exported `(name, kind)` pairs in each
result's `web/etc/api-client.api.md` and `api/etc/api.api.md` with those in
`apps/`. `type` and `interface` declarations count as types; `function`,
`const`, `class` and `enum` declarations count as values. Missing, added or
changed kinds fail. Any unrecognised `export` line fails explicitly, keeping
other declaration and re-export forms from escaping the pin.
`pnpm api:check` continues to enforce report existence
and freshness against source.

The api-client surface is therefore `ApiProvider`, `RouterInputs`,
`RouterOutputs`, `TestApiHandlers`, `TestApiProvider` and `useTrpc`, with their
reference kinds. Both router types stay available through the api-client
barrel regardless of which a result's route uses. The api-app surface stays
`AppRouter` and `appRouter`.

**Pair the pin with a narrow unused-export exemption.** `.fallowrc.jsonc`
exempts only `RouterInputs` and `RouterOutputs` in
`{apps,showcase/*}/web/src/api-client/index.ts` from unused export findings.
That removes the instruction to delete mandatory scaffold exports. In
isolation the exemption relaxes dead-code reporting; paired with
`scaffold-exports` it makes both names mandatory and tightens the accepted
result surface. Every other export remains subject to the existing checks.
The exemption lives in the root config, so a trial result has no local
exception to copy or change. A real showcase seed verifies the brace glob
against both `fallow dead-code` and `pnpm fallow:audit`.

Both structure rules run through `pnpm arch:gate`, and therefore through
`pnpm verify` and each trial's clean-checkout verification. Seeded tests in
`tooling/architecture/boundaries.test.ts` and `structure.test.ts` cover the
new failures. The prompt, comparison freedoms and author rulings stay
unchanged.

## Consequences

- The old results are expected to fail the new gates: `todo-02` and `todo-03`
  violate the integrations boundary and lack an application-to-domain value
  crossing; `todo-01`, `todo-03` and `todo-codex-01` have incomplete
  api-client export surfaces. The old results belong to the previous
  baseline and stay available in git history.
- The rerun scaffold removes that baseline's six results and live evidence
  first, using the no-evidence state of
  [0047](0047-trial-fixtures-and-the-no-evidence-state.md). All six new runs
  must share one scaffold revision and retain every failed run.
- Trials have not been rerun on the local macOS host: bubblewrap is absent.
  [0038](0038-trial-isolation-and-no-time-limit.md) requires the private
  `/tmp` mount before an agent starts. The Phase 1 PR stays draft pending a
  permitted host for Phase 2; a `consistent` verdict with zero outside-spec
  aspects remains unverified. Merge the baseline-removal commit only together
  with all six replacement trial records and the regenerated comparison.
- The existing guarded-path list is unchanged. The narrow Fallow exemption
  and its mandatory-export check are explicit review points in the PR.
- No dependency or tool owner is added. Reverting this decision's rules and
  documentation restores the prior contract; any subsequent trials still
  need evidence for the contract that judged them.
