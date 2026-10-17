# 32. Add apps/api, packages/ui and the greeting feature under an executable contract

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Implements:** [0008](0008-convert-template-into-the-monorepo.md),
  [0011](0011-effect-schema-everywhere.md),
  [0012](0012-local-state-inside-custom-hooks.md),
  [0013](0013-one-role-table-for-structure.md),
  [0014](0014-fallow-owns-architecture-checks.md)

## Context

[0031](0031-workspace-conversion.md) moved the app to `apps/web`. The brief
asks for a minimal reference monorepo with a tRPC backend in `apps/api`, UI
primitives in `packages/ui`, one greeting feature (name in, greeting out), and
an architecture contract that lint, types and dependency checks enforce for the
reference and for every generated result in `showcase/<id>/` alike, with no
per-result exception. The threshold-counter and service-status demos stand in
for that feature, and nothing yet enforces the backend half of the contract.

## Decision

**Demos.** The threshold-counter and service-status features, the shared
async-resource module, the home route, their e2e specs, API reports and verify
recipes leave ([0008](0008-convert-template-into-the-monorepo.md)).

**Result model.** A result is a pair of workspace packages, `<root>/web` and
`<root>/api`. The reference uses `apps` and the npm scope `repo`; a trial uses
`showcase/<id>` and its id as scope. `tooling/results.mjs` (`listResults`) is
the one place that discovers results, reference first, then each complete
showcase result sorted by id, with ports 5173/3001 plus 10 per result.
`pnpm-workspace.yaml` lists `apps/*` and `packages/*`.

**Packages.**

- `@repo/api` runs on Node's native type stripping (`node src/server.ts`), so
  no runner joins. `engines.node` becomes `>=22.18`, the first Node 22 that
  strips types by default. `.nvmrc` stays `22`, which installs the newest Node
  22 in CI, so CI runs at 22.18 or later without pinning an older patch.
  `exports` names only `{ ".": { "types": "./src/router.ts" } }`, so the web
  bundle can never resolve a value import of the api.
- `@repo/ui` holds `Button` and `TextField`, with `react` as its only peer.
- `@repo/web` renders the greeting route inside `ApiProvider`. Vite proxies
  `/trpc` to `API_ORIGIN` (default `http://127.0.0.1:3001`) in dev and preview.
  Root `dev` runs web and api in parallel, `build` is `pnpm -r build`, and
  `typecheck` runs both TypeScript programs.

**Role table.** Eleven roles, one Fallow zone each, matched by brace globs over
`{apps,showcase/*}` and `packages/ui`:

| Role | Files | May import | Type-only |
| --- | --- | --- | --- |
| `web-app` | `web/src/main.tsx`, `App.tsx`, `index.css` | `web-routes`, `web-api-client`, `ui` | |
| `web-api-client` | `web/src/api-client/**` | | `api-app` |
| `web-routes` | `web/src/routes/<route>/**` | `web-features`, `web-api-client`, `ui` | |
| `web-features` | `web/src/features/<feature>/**` | `web-api-client`, `ui` | |
| `ui` | `packages/ui/src/**` | | |
| `api-app` | `api/src/server.ts`, `router.ts` | `api-trpc`, `api-procedures` | |
| `api-trpc` | `api/src/trpc.ts` | | |
| `api-procedures` | `api/src/features/*/{index,procedures}.ts`, `procedures/**` | `api-trpc`, `api-application` | `api-domain` |
| `api-application` | `features/*/application.ts`, `application/**` | `api-domain`, `api-integrations` | |
| `api-domain` | `features/*/domain.ts`, `domain/**` | | |
| `api-integrations` | `features/*/integrations.ts`, `integrations/**` | `api-domain` | |

**Contract enforcers.** Each rule fails on a seeded violation in a committed
test.

| Contract rule | Enforcer |
| --- | --- |
| Routes own page composition | ESLint `policy/pages-in-routes`, Fallow `web-routes` |
| Routes never import another route; sibling slices stand alone | ESLint `policy/slice-isolation` for every result, plus Fallow child zones for `apps/web` |
| No extra layers, packages or loose slice files | Fallow `coverage.requireAllFiles`, `policy/slice-isolation` |
| Procedures validate | ESLint `policy/procedure-input-schema` |
| Procedures delegate to application logic | Fallow `api-procedures` value-imports only `api-trpc`, `api-application` |
| Domain independent of tRPC and infrastructure | Fallow `api-domain` imports nothing; `contract/domain-pure`, `contract/application-without-trpc` |
| Effectful integrations behind approved boundaries | `contract/effects-in-integrations` (`fetch`, `Effect.runPromise`, `Effect.runSync`, `Effect.runFork`), `contract/io-effects-in-integrations` (`banned-effect` network, storage, process, shell), `contract/node-io-in-integrations` |
| Frontend reaches the backend only through the type contract | Fallow `allowTypeOnly`, the `types`-only export, `contract/trpc-client-in-api-client`, `contract/trpc-server-off-the-web` |
| UI primitives have no business logic | Fallow `ui` imports nothing; `contract/ui-without-logic` |
| One React component per file | ESLint `policy/one-component-per-file` |
| State, server state and forms in `use*` hooks | ESLint `policy/state-and-effects-in-hooks` (adds `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `useForm`, `useFieldArray`) |
| Forms validate with Effect Schema | ESLint `policy/form-uses-effect-schema` |
| Every Fallow suppression names its reason | Fallow `require-suppression-reason` |
| Web code has the DOM, api code has none and only erasable syntax | `tsconfig.json` and `tsconfig.api.json` over `tsconfig.base.json` |

The rule pack is `tooling/architecture/contract.rules.jsonc`, and a policy
finding is an error. `fallow audit` runs with `audit.gate: "all"`, which fails
every finding in a changed file. The default `new-only` gate re-reads the base
revision with this config, and a base without the rule pack fails to load.

**Sibling isolation.** ESLint `policy/slice-isolation` owns it for every
result, because Fallow `autoDiscover` and zone `root` accept no globs. It also
fails a loose file directly under `src/routes/` or `src/features/` and a
relative import that leaves its package. The Fallow child zones for
`apps/web/src/routes` and `apps/web/src/features` stay as a second owner for the
reference, as strong as before. Their group patterns name only files inside a
slice folder, so a loose file under `features/` now fails
`coverage.requireAllFiles` instead of sitting in a permissive fallback zone.

**State and form convention.**

| State | Owner | Where |
| --- | --- | --- |
| Server state | TanStack Query through `@trpc/tanstack-react-query`: `useTrpc()` plus `queryOptions` or `mutationOptions` | a `use*` hook in the route folder |
| Form state | React Hook Form with `effectTsResolver(schema)`, the schema in Effect Schema | `use<Name>Form.ts` and `<name>FormSchema.ts` in the route folder |
| Local UI state | `useState` or `useReducer` | a `use*` hook |

Route tests render through `TestApiProvider` from the api client with typed
handlers per procedure path, never a mocked hook.

**Dependencies.** Seven names, all MIT: `@trpc/server`, `@trpc/client`,
`@trpc/tanstack-react-query`, `@tanstack/react-query`, `react-hook-form`,
`@hookform/resolvers` and `effect`. Effect is pinned to 3.x (`^3.22.3`),
because ADR 0011 names `Schema.standardSchemaV1` and `effectTsResolver`, and
`@hookform/resolvers` declares its Effect peer as `^3.10.3`. `@hookform/resolvers`
resolves to 5.9.1, the newest release past the install's minimum release age,
so no release-age exception is added.

**Gates over the new layout.** ESLint and the Biome naming override cover
`{apps,packages}/*/src` and `showcase/*/*/src`. Jest runs three projects: `web`
(jsdom), `api` (node) and `tooling`. Coverage covers every package source and
leaves out barrels and the composition roots (`main.tsx`, `App.tsx`,
`server.ts`). Playwright runs one Chromium project and two servers (api and
web) per result, every spec in the result's `e2e/`. API reports come per
package: the package entry gives `<package>/etc/<name>.api.md`, and each route,
feature and api-client `index.ts` gives `<package>/etc/<folder>-<name>.api.md`.
Lighthouse scope adds `packages/ui/src/`, `packages/ui/package.json` and
`tsconfig.base.json`. The role diagram renderer reads brace globs and fails when
no import crosses two roles.

**JS budget.** The stack this contract requires measures 125.97 kB brotli at
head against the 80 kB budget. The budget raise to 130 kB is one separate commit
and waits for Ben's decision. Effect 4 with `standardSchemaResolver` measured
about 26 kB less, but `effectTsResolver` does not support it.

## Consequences

- A trial result copies the reference shape and passes the same gates with no
  config entry of its own.
- A wrong import fails with a message that names the fix: Fallow names the two
  roles or the contract rule, and ESLint names the move.
- The guarded files `eslint.config.js`, `biome.json` and
  `tooling/eslint-plugin-policy.js` change, so this change waits for Ben's
  sign-off.
- `fallow audit` now also fails inherited findings in the files a change
  touches.
- The JS budget is higher than before only once Ben accepts the raise.
