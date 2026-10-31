# 85. The UI kit imports no other role, types included

- **Status:** Proposed
- **Date:** 2026-10-31
- **Amends:** [Allow type-only edges between roles and dropping a gate-flagged re-export](0037-type-only-edges-and-flagged-re-exports.md), for `ui` only

## Context

The shared UI kit supplies primitives to every result. Its Fallow rule rejects
value imports from other roles but permits their types. A primitive can therefore
depend on a result's api-client or router types, tying shared UI to that result.
The cross-result structure check covers result sources, so it does not reject
these imports from `packages/ui`.

## Decision

Set both `allow` and `allowTypeOnly` to empty lists for `ui` in `.fallowrc.jsonc`.
The UI kit imports no other role, types included. Keep every other role's
permissions and slice-isolation rules unchanged. External packages such as
React remain subject to the existing contract rules.

Prove the boundary with seeded type imports from the UI kit into the api client
and api router. Keep a contract test that rejects every outgoing UI direction
while allowing each other role to reach every other role by value or type.
Update the generated role diagram's header to state the exception.

## Consequences

UI primitives use their own types and allowed external package types. The
current primitives import only React and local UI modules, so no application
code or product behaviour changes. Type-only imports between other roles keep
the freedom recorded in the amended decision.
