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
The generator owns only `docs/architecture/roles.mmd` and an
`architecture.mmd` at `apps/` or a `showcase/<id>/` root, so a hand-written
diagram beside them stays. `--check` fails on a missing, stale or extra
diagram, where extra means a diagram at a `showcase/<id>/` root that is no
result. A write fails on an extra diagram too and leaves it for a person to
remove, because a generator that deletes files it did not write can lose work.

**Structure.** `tooling/architecture/structure.mjs` checks every result alike,
the reference included. Each rule has one violation kind:

| Rule | Kind |
| --- | --- |
| A package holds a source or style file (not a test or declaration) in each required role of its kind. | `missing-role` |
| A result root holds only `web/`, `api/` and `architecture.mmd`. A web package holds only `package.json`, `index.html`, `vite.config.ts`, `src/`, `public/`, `e2e/` and `etc/`. An api package holds only `package.json`, `src/` and `etc/`. A tool config (`package.json`, `tsconfig*.json`, `biome.json`, an ESLint, Vite, Jest or Playwright config, `.npmrc` and the like) fails at any depth below a package root. | `unexpected-file` |
| A result holds regular files only. A symlink hides what it exposes from the file rules, and Fallow resolves no import through a symlink to a folder. | `symlink` |
| A manifest is named `@<scope>/<kind>`. Every other field except the dependencies equals the reference package of its kind, with the reference scope read as the result's: `private`, `type`, `version`, `exports`, and the script names and commands. It lists only that package's external dependencies with the same ranges. A web package lists exactly its own `@<scope>/api` and `@repo/ui` as workspace dependencies; an api package lists none. | `manifest` |
| A folder under `showcase/` has both `web/package.json` and `api/package.json`. | `incomplete-result` |
| A web package holds at least one `e2e/*.spec.ts`. | `missing-e2e` |
| An import edge stays inside one result, or reaches `packages/ui`. | `cross-result-import` |
| No line under a result root holds `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `biome-ignore`, `fallow-ignore`, ESLint inline config (`/* eslint <rule>: off */`, `/* eslint-env */`), `/* global */`, or a coverage pragma (`istanbul`, `c8` or `v8` `ignore`). | `suppression` |

PLAN's sketch named five kinds and compared script names only. A two-model
review seeded a showcase result that passed the gate four ways: a symlink to
another result's folder, a nested `src/biome.json` that turned Biome rules off,
`/* eslint <rule>: off */`, and `"build": "true"`. Each now fails. One kind per
rule gives eight: `incomplete-result`, `missing-e2e` and `symlink` join.

The reference is the baseline, so its own scripts and dependencies are the
measure and never a violation. A change to them changes what every result must
match, and `check:adr` asks for an ADR when it adds a dependency.

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
- Each architecture CLI runs `fallow config` and `fallow viz` once. The median
  of five interleaved `pnpm arch:check` runs was 7.43 s on `main` and 9.03 s
  with this change on the same box.
- ESLint still honours inline config outside a result, and an
  `e2e/*.spec.ts` with no test passes `missing-e2e`. Turning on ESLint's
  `noInlineConfig` edits `eslint.config.js`, a guarded file, so it is left for
  a separate change.
