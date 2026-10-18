# 37. Allow type-only edges between roles and dropping a gate-flagged re-export

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Amends:** [0032](0032-api-ui-greeting-and-contract.md) (role table),
  [0033](0033-result-diagrams-and-structure-validation.md) (canonical diagram),
  [0035](0035-trial-comparison.md) (spec freedoms)

## Context

The first Todo comparison ([0035](0035-trial-comparison.md)) read
`inconsistent` on two aspects, each with an author's note and no ruling:

- todo-03 annotates its toggle procedure's return type with `Todo`, imported
  type-only from `domain.ts`. The comparison read the new `api-procedures`
  to `api-domain` edge as a structure difference, since the freedoms kept
  every role edge fixed.
- todo-02 removed the `RouterInputs` re-export from its api-client barrel
  after `fallow audit` flagged it as an unused type export. The comparison
  read the shorter export list of a scaffold role as a public API difference.

Both runs did what the repository asked of them. A type-only import carries
no code into a bundle or a process, so it leaves the layering the role table
protects intact. A gate that flags an export asks the agent to remove it.

The role table also allowed type-only imports in only two directions
(`web-api-client` to `api-app`, `api-procedures` to `api-domain`), so Fallow
failed every other type-only import between roles, such as a route that names
the router type.

Ben decided on 18 October 2026: a type-only import between roles is allowed,
and it is no difference outside the spec freedoms; an agent may drop a
re-export that a gate flagged, within the freedoms; a value import between
roles the contract keeps apart stays a violation.

## Decision

**Type-only imports between roles.** Each rule in the `boundaries` block of
`.fallowrc.jsonc` lists, under `allowTypeOnly`, every other role its `allow`
leaves out. Fallow 3.33.1 admits an `import type` or `export type … from`
crossing on an `allowTypeOnly` direction and fails a value import on it, so
every value direction stays exactly as [0032](0032-api-ui-greeting-and-contract.md)
set it. `tooling/architecture/contract.test.ts` holds the repository contract
to a direction from every role to every other role, and to the value
directions of the role table, so a new role carries the freedom and a widened
`allow` fails. `tooling/architecture/boundaries.test.ts` runs the real Fallow
gate over seeded type-only imports on forbidden directions, which pass, and
over the value imports on the same directions, which fail.

Sibling slices are one role, not two. A route that imports another route, by
type or by value, still fails Fallow's child zones and ESLint
`policy/slice-isolation`. The rule pack's banned packages per role, the
relative-import rule between packages and the `types`-only export of each api
package are unchanged, so the web still reaches the api only by type.

**Diagrams.** The canonical diagram `docs/architecture/roles.mmd` draws every
role and every value direction, and its header states that any role may
import types from any other. Drawn as edges, the type-only directions would
join every pair of roles. A result diagram still draws the role edges its
imports resolve to, dashed (`-.->`) where the pair is allowed for types only.
Fallow's file graph records no import kind, so a type-only import along a
direction that also allows values draws solid, the same as a value import.

**Structure validation.** `tooling/architecture/structure.mjs` holds no
role-direction rule; Fallow owns directions
([0014](0014-fallow-owns-architecture-checks.md)). It needs no change.

**Comparison.** The comparison of [0035](0035-trial-comparison.md) gains two
freedoms. The comparison reads an edge as dashed when the result diagram
dashes it, or when every import and re-export along it brings in types only.
`tooling/trial/result-facts.mjs` parses the result's sources for that: an
`import type`, an import whose every named specifier is `type`, an
`export type … from`, or a re-export whose every named specifier is `type`.
A side-effect import, `export *`, a dynamic `import()`, `require` or a module
mock is a value crossing, and so is a relative specifier that names no file
of the result. A dashed edge that only some runs have sits in freedom 8 by the
script's rule when every compared run's `verify` check exited 0. A result
diagram dashes every role pair outside `allow`, so that dashed edge proves a
type-only import only on a tree that passed Fallow; with any run unverified,
the edge stays outside the spec, as a value edge always does. For freedom 9,
the script reads each run's committed stream for the gate findings Fallow
prints as `Unused exports` or `Unused type exports` with a `(re-export)` entry.
It reads a tool result only when its call is a Bash command that runs a gate
(`pnpm verify`, `pnpm fallow:audit`, `fallow audit` or `fallow dead-code`), so
text another tool prints counts for nothing, and so does a `printf` in a
command that names no gate. A finding counts
only when its file is the entry file an API report of that run reads, and only
when that report no longer exports the flagged name. An API report's export
list differs inside freedom 9 when, with each run's flagged re-exports added
back, every run's list is the same. A run that drops an export its own stream
holds no such finding for stays outside the spec. The two author notes on
these aspects go, since neither
aspect is outside the spec now.

## Spec freedoms

8. A type-only import between roles, along any direction, which the comparison reads as a dashed edge.
9. Dropping a re-export that a gate flagged, such as an unused export Fallow reports.

## Consequences

- The regenerated report reads `consistent`: todo-03's edge sits in freedom 8
  and todo-02's export list in freedom 9. The pass count stays 2/3.
- The trial prompt `tooling/trial/todo-prompt.md` holds no freedom list, and
  it stays as is, so the template hash the runs recorded still matches. The
  agent-facing rule lives in the role table of
  `.agents/project/ARCHITECTURE.md`.
- A type-only import along a direction that also allows values draws solid
  in the result diagram, and the comparison still reads it as dashed. All
  three committed runs import their `Todo` type into `api-integrations` that
  way, so the report shows `edge api-integrations -.-> api-domain`. A crossing
  the source parse misses, such as an import through a path alias, leaves the
  edge solid and outside the spec.
- Freedom 8 needs every compared run verified, so a dashed edge in a set with
  a run whose `verify` check failed needs an author's ruling.
- Freedom 9 reads Fallow's human output in the stream, from a Bash command that
  runs a gate, on an API report's entry file, for a name the report dropped. A
  finding the agent read in another format, a gate other than Fallow, or a finding
  on an internal file needs an author's ruling. A command matches by its text,
  so a `printf` that also names a gate command still counts.
- `boundaries.test.ts` replaces its seeded failure for a route that
  type-imports `@repo/api` with a passing case; the value import of
  `appRouter` still fails.
- No dependency is added.
