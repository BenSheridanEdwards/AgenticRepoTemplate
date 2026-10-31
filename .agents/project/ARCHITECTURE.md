# Architecture

## The shape

The pnpm workspace contains the reference result in `apps/`, generated results
in `showcase/<id>/`, and shared UI primitives in `packages/ui` (`@repo/ui`).
Each result pairs `web/` and `api/` packages. Root configs include all results
by glob; a new result needs no gate config entry.

`tooling/results.mjs` (`listResults`) discovers the reference first, then
showcase folders with both package manifests, sorted by id. Copy the greeting
feature's shape ([ADR 0032](../decisions/0032-api-ui-greeting-and-contract.md)).

## Roles

[`.fallowrc.jsonc`](../../.fallowrc.jsonc) maps roles to Fallow zones through
`{apps,showcase/*}`. Value imports follow the table; `coverage.requireAllFiles`
requires a role for every source file. Type-only imports may cross roles except into `ui`,
subject to route co-location and sibling-slice isolation
([ADR 0037](../decisions/0037-type-only-edges-and-flagged-re-exports.md)).
Write `import type` or mark every specifier `type`; Fallow treats an unmarked
import as a value even if it is used only as a type. Paths below are relative
to a result root (`apps/` or `showcase/<id>/`).

| Role | Files | May import |
| --- | --- | --- |
| `web-app` | `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css` | `web-routes`, `web-api-client`, `ui` |
| `web-api-client` | `web/src/api-client/**` | no other role |
| `web-routes` | `web/src/routes/<route>/**` | own route, api-client public surface, `@repo/ui`, external npm packages |
| `web-features` | legacy Fallow zone; rejected in every result by structure | keep web feature code inside its route |
| `ui` | `packages/ui/src/**` | no other role, types included |
| `api-app` | `api/src/server.ts`, `api/src/router.ts` | `api-trpc`, `api-procedures` |
| `api-trpc` | `api/src/trpc.ts` | no other role |
| `api-procedures` | `api/src/features/<name>/{index,procedures}.ts`, `features/<name>/procedures/**` | `api-trpc`, `api-application` |
| `api-application` | `api/src/features/<name>/application.ts`, `features/<name>/application/**` | `api-domain`, `api-integrations` |
| `api-domain` | `api/src/features/<name>/domain.ts`, `features/<name>/domain/**` | no other role |
| `api-integrations` | `api/src/features/<name>/integrations.ts`, `features/<name>/integrations/**` | `api-domain` types only |

Tests (`*.test.ts(x)`), `web/e2e/**`, `web/index.html`, `web/vite.config.ts`
and `etc/**` sit outside the roles. A file that grows too large becomes a
folder of the same name, such as `features/<name>/application/`, and keeps its
role.

`pnpm arch:diagram` generates [the role diagram](../../docs/architecture/roles.mmd)
and each result's `architecture.mmd`. Dashed edges allow types only. Where a
pair also allows values, Fallow draws a solid edge; trial comparison reads
source imports to distinguish types from values.

## Result structure

`tooling/architecture/structure.mjs` checks every result alike, the reference
included ([ADR 0033](../decisions/0033-result-diagrams-and-structure-validation.md)):

- Each web package holds a source file in `web-app`, `web-api-client` and
  `web-routes`, and each api package in `api-app`, `api-trpc`,
  `api-procedures`, `api-application` and `api-domain`. A test file holds no
  role.
- Every route owns its components, hooks, state, schemas, types and tests.
  `single-route-features` rejects web features and feature reports for every result.
  `route-colocation` permits imports only from its own folder, `@repo/ui`, its api-client barrel and external npm packages.
  Trial routes also follow the exact [list-route template](../templates/list-route.md),
  enforced by `trial-route-inventory` ([ADR 0075](../decisions/0075-canonical-colocated-routes.md)).
- In each api feature with application and domain source files, application
  imports or re-exports at least one value from that feature's domain.
  `application-without-domain-rule` checks Fallow's resolved edges and the
  shared import-kind reader in `tooling/architecture/imports.mjs`.
- Each result's scaffold API reports, `web/etc/api-client.api.md` and
  `api/etc/api.api.md`, keep the reference's exported names and kinds
  (`scaffold-exports`). The api-client barrel keeps `ApiProvider`,
  `RouterInputs`, `RouterOutputs`, `TestApiHandlers`, `TestApiProvider` and
  `useTrpc`. Fallow exempts only the two router type re-exports from unused
  export findings; the structure check makes them mandatory
  ([ADR 0054](../decisions/0054-domain-rules-in-application-and-a-fixed-api-client-surface.md)).
- A result root holds `web/`, `api/` and `architecture.mmd`. A web package
  holds `package.json`, `index.html`, `vite.config.ts`, `src/`, `public/`,
  `e2e/` and `etc/`. An api package holds `package.json`, `src/` and `etc/`.
  The root configs own every gate, so every tool config, at any depth, lives
  at the repository root. A result holds regular files, so copy a file
  rather than link it.
- A manifest is named `@<scope>/<kind>`. Its other fields, scripts included,
  equal the reference package of its kind, and it lists a subset of that
  package's dependencies with the same ranges. A web package lists its
  own `@<scope>/api` and `@repo/ui` as workspace dependencies; an api package
  lists only external ones.
- A web package holds at least one `e2e/**/*.spec.ts`, the specs Playwright runs.
- Each import stays inside its result or reaches `packages/ui`.
- A result fixes each finding in code, so it holds no suppression directive,
  ESLint inline config in a block comment, `/* global */` comment or coverage
  pragma.

## The api file roles

| File | Holds | Shape in the greeting feature |
| --- | --- | --- |
| `procedures.ts` | The feature's tRPC router. Each procedure validates its input with `.input(Schema.toStandardSchemaV1(schema))`, with `Schema` from `effect`, and delegates to application. It maps application errors to `TRPCError`. | `greetingRouter = router({ greet: procedure.input(Schema.toStandardSchemaV1(greetInputSchema)).query(({ input }) => greet(input)) })` |
| `application.ts` | The use cases. It calls domain rules and integrations and knows no transport. | `greet(request)` returns `{ message: formatGreeting(request.name) }` |
| `domain.ts` | Pure types and rules. It imports nothing by value: no tRPC, no Effect, no Node. | `Greeting`, `formatGreeting(name)` |
| `integrations.ts` | Storage, including in-memory storage, and every effect: `fetch`, Node IO, `Effect.runPromise`, `Effect.runSync`, `Effect.runFork`. It imports domain types only; application calls domain rules and integrations. | The greeting needs none, so the file is absent. |
| `index.ts` | The public surface: the feature's router. | `export { greetingRouter } from './procedures.ts';` |

Mount each feature router through its `index.ts` in `api/src/router.ts`.

Every relative import in the api names its `.ts` extension, because Node runs
the source directly (`node src/server.ts`) and `tsconfig.api.json` resolves
with `NodeNext`. Web code imports without extensions (`./routes/greeting`),
because Vite resolves it.

## The web state model

| State | Owner | Where |
| --- | --- | --- |
| Server state | TanStack Query through `useTrpc()` with `trpc.<router>.<procedure>.queryOptions(input)` or `.mutationOptions(options)` | a `use*` hook in the route folder, such as `useGreeting.ts` |
| Form state | React Hook Form: `useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema)), defaultValues })` | `use<Name>Form.ts`, with the schema in `<name>FormSchema.ts` in Effect Schema |
| Local UI state | `useState` or `useReducer` | a `use*` hook |

A component calls its hooks and renders. It holds no state, effect, query,
mutation or form of its own.

Routes obtain api types through `RouterInputs` and `RouterOutputs` from their api-client barrel. The api
client is the only web module that wires the tRPC client and imports its
packages, `@trpc/client` and `@trpc/tanstack-react-query`. Everything else
reaches the api through `useTrpc()` from `../../api-client`.

After a mutation, invalidate the queries it changes in `onSuccess` with
`queryClient.invalidateQueries({ queryKey: trpc.<router>.<procedure>.queryKey() })`.

Route and hook tests use `TestApiProvider` with a typed handler per procedure
path and exercise real hooks and providers. Copy the greeting page test;
a missing handler fails with `TestApiProvider has no handler for <path>`.

## The rules

Seeded violations in architecture and ESLint policy tests prove these checks;
each check's message names the fix.

| Rule | Enforced by | Proved by |
| --- | --- | --- |
| Routes own page composition. | ESLint `policy/pages-in-routes`, Fallow `web-routes` | `pnpm lint:policy`, `pnpm arch:gate` |
| Every route owns its code; global primitives are `@repo/ui` and the fixed api-client surface. | Structure `single-route-features`, `route-colocation` | `pnpm arch:gate` |
| Todo and Notes routes use the exact template files, components and props. | Structure `trial-route-inventory` | `pnpm arch:gate` |
| Sibling slices stand alone: a route imports no other route, a feature no other feature. | ESLint `policy/slice-isolation` for every result; Fallow child zones for the `apps/web` routes | `pnpm lint:policy`, `pnpm arch:gate` |
| Every file belongs to one role and one slice. | Fallow `coverage.requireAllFiles`; `policy/slice-isolation` for a loose file under `src/routes/` or `src/features/` | `pnpm arch:gate`, `pnpm lint:policy` |
| A package reaches another only by its package name. | `policy/slice-isolation` (relative import out of the package) | `pnpm lint:policy` |
| A module is imported through its `index.ts`. | ESLint `no-restricted-imports`; API reports | `pnpm lint:policy`, `pnpm api:check` |
| Procedures validate their input with Effect Schema. | ESLint `policy/procedure-input-schema` | `pnpm lint:policy` |
| Procedures delegate to application logic. | Fallow `api-procedures` value-imports only `api-trpc`, `api-application` | `pnpm arch:gate` |
| Integrations import domain types only. | Fallow `api-integrations` allows `api-domain` through `allowTypeOnly` | `pnpm arch:gate`, `pnpm fallow:audit` |
| Each feature's application imports or re-exports a value from its domain. | Structure `application-without-domain-rule` | `pnpm arch:gate` |
| Scaffold API exports match the reference's names and kinds. | Structure `scaffold-exports`; API report freshness | `pnpm arch:gate`, `pnpm api:check` |
| The domain is pure, and application knows no tRPC. | Fallow `api-domain`; `contract/domain-pure`, `contract/application-without-trpc`; `tsconfig.domain.json` (no Node types) | `pnpm arch:gate`, `pnpm fallow:audit`, `pnpm typecheck` |
| Effects run only in integrations or the api composition root. | `contract/effects-in-integrations`, `contract/io-effects-in-integrations`, `contract/node-io-in-integrations` | `pnpm arch:gate`, `pnpm fallow:audit` |
| The web reaches the api only by type: `import type` of the router type. | Fallow `allowTypeOnly` (a value import of `api-app` fails); the `types`-only export of `@repo/api`; `contract/trpc-client-in-api-client`, `contract/trpc-server-off-the-web` | `pnpm arch:gate`, `pnpm fallow:audit` |
| UI primitives hold no business logic. | Fallow `ui` imports no other role, types included; `contract/ui-without-logic` | `pnpm arch:gate`, `pnpm fallow:audit` |
| One React component per file. | ESLint `policy/one-component-per-file` | `pnpm lint:policy` |
| State, server state and form state live in `use*` hooks. | ESLint `policy/state-and-effects-in-hooks` | `pnpm lint:policy` |
| Forms validate with Effect Schema. | ESLint `policy/form-uses-effect-schema` | `pnpm lint:policy` |
| Web code has the DOM and no Node; api code has no DOM and only erasable syntax; domain code has neither. | `tsconfig.json` (web, ui), `tsconfig.api.json` and `tsconfig.domain.json` over `tsconfig.base.json` | `pnpm typecheck` |
| Behaviour is defined by each result's E2E specs. | Playwright, one project per result | `pnpm e2e` |

Fallow loads [`contract.rules.jsonc`](../../tooling/architecture/contract.rules.jsonc)
as a rule pack and reports `contract/<id>` findings as errors. Each result's
`web/e2e/*.spec.ts` defines behaviour; PRDs in `docs/prd/` link each behaviour
to its test ([ADR 0045](../decisions/0045-prds-state-intent-and-link-their-specs.md)).

## Architecture checks

`pnpm arch:check` runs Fallow architecture, the structure check, diagram
freshness and API report freshness. `pnpm arch:diagram` regenerates the role
and result diagrams. `pnpm api:report` regenerates package and public-barrel
reports under each package's `etc/`; commit generated changes with the code.
See [ADR 0033](../decisions/0033-result-diagrams-and-structure-validation.md).

`pnpm arch:gate` checks `contract/<id>` rules in files reached from entry
points. `pnpm fallow:audit` checks touched files with `audit.gate: "all"`,
including inherited findings.

## Showcase results

The trial harness creates `showcase/<id>/` in a fresh clone and records evidence
in `docs/trials/<id>.json`. Follow the reference layout, roles, scripts and
dependencies with the id as npm scope (`@todo-01/web`, `@todo-01/api`). Import
only the result's own api (types only) and `@repo/ui`.

Every gate includes results through shared globs (`tooling/trial/inclusion.test.ts`).
Each result must reach 80 percent coverage and pass its own E2E specs plus
`tooling/trial/acceptance/todo.spec.ts` as `<id>-acceptance`. The six recorded
Todo results retain only the duplication and health exceptions in
[ADR 0059](../decisions/0059-preserve-recorded-trial-outputs-in-duplication-analysis.md).

`node tooling/trial/compare.mjs` compares all runs, including failures, in
`docs/trials/comparison.md`. Keep differences within the freedoms listed in
[ADR 0035](../decisions/0035-trial-comparison.md) and
[ADR 0037](../decisions/0037-type-only-edges-and-flagged-re-exports.md), including
type-only edges and removal of re-exports flagged by a gate.
See [ADR 0034](../decisions/0034-trial-harness-and-evidence.md) for the harness.

## What this template intentionally omits

The template leaves out a router library, a store, a database and auth.
A result keeps its data in memory inside `integrations.ts`. When you add one of them, record the choice as an ADR
in [`../decisions/`](../decisions) and give it a role in `.fallowrc.jsonc`.

## How to extend

Use the greeting feature as the model at every step. Paths are shown for the
reference result; a trial result uses `showcase/<id>/` in place of `apps/`.

### Add an api feature

1. Create `apps/api/src/features/<name>/` (kebab-case) with `domain.ts`,
   `application.ts`, `procedures.ts` and `index.ts`. Add `integrations.ts` for
   storage or any effect.
2. Write the domain and application tests first, then a procedures test through
   `createCallerFactory(<name>Router)({})`, as in
   `apps/api/src/features/greeting/procedures.test.ts`.
3. Mount the router in `apps/api/src/router.ts`: import
   `./features/<name>/index.ts` and add it to `router({ ... })`.

### Add a procedure

1. Add the input schema in `procedures.ts` and pass it as
   `.input(Schema.toStandardSchemaV1(schema))`.
2. End with `.query(...)` for a read and `.mutation(...)` for a write, and
   delegate to one application function.
3. Cover the valid input and the rejected input (`BAD_REQUEST`) in
   `procedures.test.ts`.

### Add a route

1. Create `apps/web/src/routes/<route-name>/` with `<Name>Page.tsx` and an
   `index.ts` that exports the page. For Todo and Notes, copy the exact
   [list-route inventory and signatures](../templates/list-route.md).
2. Put server state in `use<Name>.ts` through `useTrpc()`, form state in
   `use<Name>Form.ts` and `<name>FormSchema.ts`, and each component in its own
   file built from `@repo/ui` primitives.
3. Test the page and hooks through `TestApiProvider`.
4. Mount the page in `apps/web/src/App.tsx`.
5. Specify the behaviour in `apps/web/e2e/<route-name>.spec.ts`. Playwright
   runs every spec in that folder.

Keep route code and its tests in that route's folder, even with multiple routes.
Share only `@repo/ui` primitives and the fixed api-client public surface;
transport and test-provider wiring stays in the api-client.

### Finish

1. Run `pnpm api:report` and commit the new or changed `etc/*.api.md`.
2. Run `pnpm arch:diagram` and commit `apps/architecture.mmd` and
   `docs/architecture/roles.mmd` when they change.
3. `pnpm verify` and `pnpm e2e` pass before you call it done.
