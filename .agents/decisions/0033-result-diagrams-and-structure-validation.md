# 33. Generate a diagram per result and validate structure against the contract

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Implements:** [0013](0013-one-role-table-for-structure.md),
  [0014](0014-fallow-owns-architecture-checks.md),
  [0032](0032-api-ui-greeting-and-contract.md)

## Context

[0032](0032-api-ui-greeting-and-contract.md) made the contract executable per
file: Fallow zones and the rule pack, ESLint and TypeScript. Some rules are
about a result as a whole, and no tool checks them. A result can lack a role,
carry a nested `tsconfig.json`, add a dependency the reference lacks, import
another result, or silence a gate with a suppression. `docs/architecture/roles.mmd`
drew the imports that exist today, so it could never show a direction the
rules allow and no file uses yet. No result had a diagram of its own, so
comparing two results meant reading their code.

## Decision

**One reader.** `tooling/architecture/graph.mjs` is the one place the
architecture tools run Fallow and git. It reads the contract from
`fallow config --format json`, the file graph from
`fallow viz --viz-format dot`, the files from
`git ls-files --cached --others --exclude-standard`, and the results from
`tooling/results.mjs`. Fallow owns the graph ([0014](0014-fallow-owns-architecture-checks.md)),
and both tools read it the same way.
`fallow list --boundaries` is not the contract's input, because it drops
`allowTypeOnly` from every rule.

**The contract as data.** `tooling/architecture/contract.mjs` turns the
`boundaries` block into the roles in declared order, one direction per allowed
role (type-only where the rule says `allowTypeOnly`), each role's package kind
from its name prefix (`web-`, `api-`, `ui`), and a lookup from a file to its
first matching zone. The roles every package must hold are a table there:
`web-app`, `web-api-client` and `web-routes` for web, and `api-app`,
`api-trpc`, `api-procedures`, `api-application` and `api-domain` for api.
A zone with no package kind, or a required role with no zone, fails loading.

**Diagrams.** `tooling/architecture/diagram.mjs` writes
`docs/architecture/roles.mmd`, the canonical diagram: every role and every
direction the rules allow. It writes `<root>/architecture.mmd` for each result:
the roles its files hold and the role edges its imports resolve to. Both use
the same conventions: `flowchart LR`, a header comment naming the generator
and the result, subgraphs `web`, `api` and `ui` in that order (ids `kind_web`,
`kind_api` and `kind_ui`, so the `ui` node keeps its id), roles in declared
order, node ids equal to role names with `-` turned into `_`, sorted edges,
and a dashed edge (`-.->`) where the contract allows only a type-only import.
Two results with the same structure differ only in the header line.
`--check` fails on a missing, stale or extra diagram. A write removes an extra
one, so `pnpm arch:diagram` always converges.

**Structure.** `tooling/architecture/structure.mjs` checks every result alike,
the reference included. Each rule has one violation kind:

| Rule | Kind |
| --- | --- |
| A package holds a file in each required role of its kind. | `missing-role` |
| A result root holds only `web/`, `api/` and `architecture.mmd`. A web package holds only `package.json`, `index.html`, `vite.config.ts`, `src/`, `public/`, `e2e/` and `etc/`. An api package holds only `package.json`, `src/` and `etc/`. | `unexpected-file` |
| A manifest is `@<scope>/<kind>`, private, `type: module`, has the script names of the reference package of its kind, and lists only that package's external dependencies with the same ranges. A web package lists exactly its own `@<scope>/api` and `@repo/ui` as workspace dependencies; an api package lists none. | `manifest` |
| A folder under `showcase/` has both `web/package.json` and `api/package.json`. | `incomplete-result` |
| A web package holds at least one `e2e/*.spec.ts`. | `missing-e2e` |
| An import edge stays inside one result, or reaches `packages/ui`. | `cross-result-import` |
| No line under a result root holds `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `biome-ignore` or `fallow-ignore`. | `suppression` |

PLAN's sketch named five kinds. The rule list has seven rules, so
`incomplete-result` and `missing-e2e` join, one kind per rule. `@ts-nocheck`
joins the suppression list, because it silences more than `@ts-ignore`.

**Wiring.** `pnpm arch:gate` runs `fallow architecture -q`, then
`node tooling/architecture/structure.mjs`, then
`node tooling/architecture/diagram.mjs --check`. `pnpm arch:diagram` runs
`node tooling/architecture/diagram.mjs`. `pnpm arch:check` and `ci.yml` keep
their commands, so the `Code intelligence (Fallow)` job runs the new checks
through the same three steps, and the ten required job names stay the same.
`scripts/fallow-roles.mjs` moves to `tooling/architecture/diagram.mjs` and its
test to `diagram.test.ts`. `readFallowBoundaries` leaves with it: nothing
called it.

## Consequences

- A showcase result gets its diagram and its structure check with no config
  entry. The tests build a temporary monorepo with a showcase-shaped result,
  so nothing seeded is committed under `showcase/`.
- `docs/architecture/roles.mmd` now changes only when the rules change. A
  result's own diagram shows what its code does.
- A result cannot widen its own dependencies or scripts. Adding one to every
  result starts in the reference package, where `check:adr` asks for its ADR.
- The parser keeps its loud failure on an empty dot parse, and the exact
  Fallow pin protects the dot and config formats.
- Each architecture CLI runs Fallow once more. `pnpm arch:check` stays within
  a few seconds of its time on `main`.
