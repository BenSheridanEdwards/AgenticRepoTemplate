# Architecture

> This is the anchor for **showcase #2**: agent-written code must follow the
> patterns described here. When asked to verify or review work, an agent checks
> the change against this document first.

## The shape

The repo is a pnpm workspace with one reference **result** and a UI kit
([ADR 0032](../decisions/0032-api-ui-greeting-and-contract.md)):

- A result is a pair of packages, `<root>/web` and `<root>/api`. The reference
  result lives in `apps/` (`@repo/web`, `@repo/api`). Each generated trial
  result lives in `showcase/<id>/` with the same shape.
- `packages/ui` (`@repo/ui`) holds the UI primitives every result renders with.
- `tooling/results.mjs` (`listResults`) is the one place that discovers
  results: the reference first, then each `showcase/<id>` that has both
  `web/package.json` and `api/package.json`, sorted by id.

The root configs own every gate and reach each package by glob, so a new result
joins every gate with no config entry of its own.

The reference implementation is the **greeting feature**: a name goes in, the
api greets it back. Copy its shape for every new feature.

```
apps/
├── web/                                 # @repo/web, Vite + React
│   ├── src/
│   │   ├── main.tsx                     # composition root: DOM, styles, ApiProvider
│   │   ├── App.tsx                      # mounts the routes; holds no business logic
│   │   ├── index.css
│   │   ├── api-client/                  # the only door to the api
│   │   │   ├── trpc.ts                  # useTrpc, TrpcProvider, RouterInputs, RouterOutputs
│   │   │   ├── ApiProvider.tsx          # real tRPC client over /trpc + QueryClient
│   │   │   ├── TestApiProvider.tsx      # the same providers over typed in-memory handlers
│   │   │   ├── testApiHandlers.ts       # TestApiHandlers, one handler per procedure path
│   │   │   ├── useTestApiClients.ts
│   │   │   └── index.ts                 # public surface
│   │   ├── routes/
│   │   │   └── greeting/                # one folder per route, kebab-case
│   │   │       ├── GreetingPage.tsx     # the page: composes the route's components
│   │   │       ├── GreetingForm.tsx     # one component per file
│   │   │       ├── GreetingMessage.tsx
│   │   │       ├── useGreeting.ts       # server state + local state
│   │   │       ├── useGreetingForm.ts   # form state
│   │   │       ├── greetingFormSchema.ts  # Effect Schema for the form
│   │   │       ├── *.test.ts(x)         # co-located tests
│   │   │       └── index.ts             # public surface: GreetingPage
│   │   └── features/<feature-name>/     # optional: web code that routes share
│   ├── e2e/                             # the behaviour map: greeting.spec.ts, accessibility.spec.ts
│   ├── etc/                             # generated API reports
│   └── vite.config.ts                   # proxies /trpc to API_ORIGIN (default http://127.0.0.1:3001)
└── api/                                 # @repo/api, Node with native type stripping
    ├── src/
    │   ├── server.ts                    # composition root: the HTTP server on PORT (default 3001)
    │   ├── router.ts                    # appRouter and the AppRouter type
    │   ├── trpc.ts                      # initTRPC: router, procedure, createCallerFactory
    │   └── features/
    │       └── greeting/
    │           ├── index.ts             # public surface: greetingRouter
    │           ├── procedures.ts        # validates input, delegates to application
    │           ├── application.ts       # use cases: greet
    │           ├── domain.ts            # pure types and rules: Greeting, formatGreeting
    │           ├── integrations.ts      # storage and every effect (the greeting has none)
    │           └── *.test.ts
    ├── etc/
    └── package.json                     # exports only { ".": { "types": "./src/router.ts" } }
packages/ui/                             # @repo/ui, react as its only peer
├── src/
│   ├── Button.tsx
│   ├── TextField.tsx
│   ├── styles.css                       # imported once in main.tsx as '@repo/ui/styles.css'
│   └── index.ts
└── etc/ui.api.md
showcase/<id>/                           # a trial result: the same web/ and api/ shape
├── web/{src,e2e}/...
└── api/src/...
```

## Roles

[`.fallowrc.jsonc`](../../.fallowrc.jsonc) is the one rules file. Each role is
a Fallow zone, and its patterns match every result through the brace glob
`{apps,showcase/*}`. Fallow fails any import the table does not allow, and
`coverage.requireAllFiles` fails any source file that sits in no role. Paths
below are relative to a result root (`apps/` or `showcase/<id>/`).

| Role | Files | May import | Type-only import |
| --- | --- | --- | --- |
| `web-app` | `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css` | `web-routes`, `web-api-client`, `ui` | |
| `web-api-client` | `web/src/api-client/**` | no other role | `api-app` |
| `web-routes` | `web/src/routes/<route>/**` | `web-features`, `web-api-client`, `ui` | |
| `web-features` | `web/src/features/<feature>/**` | `web-api-client`, `ui` | |
| `ui` | `packages/ui/src/**` | no other role | |
| `api-app` | `api/src/server.ts`, `api/src/router.ts` | `api-trpc`, `api-procedures` | |
| `api-trpc` | `api/src/trpc.ts` | no other role | |
| `api-procedures` | `api/src/features/<name>/{index,procedures}.ts`, `features/<name>/procedures/**` | `api-trpc`, `api-application` | `api-domain` |
| `api-application` | `api/src/features/<name>/application.ts`, `features/<name>/application/**` | `api-domain`, `api-integrations` | |
| `api-domain` | `api/src/features/<name>/domain.ts`, `features/<name>/domain/**` | no other role | |
| `api-integrations` | `api/src/features/<name>/integrations.ts`, `features/<name>/integrations/**` | `api-domain` | |

Tests (`*.test.ts(x)`), `web/e2e/**`, `web/index.html`, `web/vite.config.ts`
and `etc/**` sit outside the roles. A file that grows too large becomes a
folder of the same name, such as `features/<name>/application/`, and keeps its
role.

The canonical diagram [`docs/architecture/roles.mmd`](../../docs/architecture/roles.mmd)
shows every role and every direction the rules allow, dashed where only a
type-only import is allowed. Each result has its own generated diagram,
[`apps/architecture.mmd`](../../apps/architecture.mmd) for the reference and
`showcase/<id>/architecture.mmd` for a trial, with the role edges its imports
resolve to. Both come from `pnpm arch:diagram`, with the same node names.

## Result structure

`tooling/architecture/structure.mjs` checks every result alike, the reference
included ([ADR 0033](../decisions/0033-result-diagrams-and-structure-validation.md)):

- Each web package holds a source file in `web-app`, `web-api-client` and
  `web-routes`, and each api package in `api-app`, `api-trpc`,
  `api-procedures`, `api-application` and `api-domain`. A test file holds no
  role.
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
- A web package holds at least one `e2e/*.spec.ts`.
- Each import stays inside its result or reaches `packages/ui`.
- A result fixes each finding in code, so it holds no suppression directive,
  ESLint inline config, `/* global */` comment or coverage pragma.

## The api file roles

| File | Holds | Shape in the greeting feature |
| --- | --- | --- |
| `procedures.ts` | The feature's tRPC router. Each procedure validates its input with `.input(Schema.standardSchemaV1(schema))`, with `Schema` from `effect`, and delegates to application. It maps application errors to `TRPCError`. | `greetingRouter = router({ greet: procedure.input(Schema.standardSchemaV1(greetInputSchema)).query(({ input }) => greet(input)) })` |
| `application.ts` | The use cases. It calls domain rules and integrations and knows no transport. | `greet(request)` returns `{ message: formatGreeting(request.name) }` |
| `domain.ts` | Pure types and rules. It imports nothing: no tRPC, no Effect, no Node. | `Greeting`, `formatGreeting(name)` |
| `integrations.ts` | Storage, including in-memory storage, and every effect: `fetch`, Node IO, `Effect.runPromise`, `Effect.runSync`, `Effect.runFork`. Application calls it. | The greeting needs none, so the file is absent. |
| `index.ts` | The public surface: the feature's router. | `export { greetingRouter } from './procedures.ts';` |

The router mounts each feature through its `index.ts`, with the extension:

```ts
// apps/api/src/router.ts
import { greetingRouter } from './features/greeting/index.ts';
import { router } from './trpc.ts';

export const appRouter = router({ greeting: greetingRouter });
export type AppRouter = typeof appRouter;
```

Every relative import in the api names its `.ts` extension, because Node runs
the source directly (`node src/server.ts`) and `tsconfig.api.json` resolves
with `NodeNext`. Web code imports without extensions (`./routes/greeting`),
because Vite resolves it.

## The web state model

| State | Owner | Where |
| --- | --- | --- |
| Server state | TanStack Query through `useTrpc()` with `trpc.<router>.<procedure>.queryOptions(input)` or `.mutationOptions(options)` | a `use*` hook in the route folder, such as `useGreeting.ts` |
| Form state | React Hook Form: `useForm({ resolver: effectTsResolver(schema), defaultValues })` | `use<Name>Form.ts`, with the schema in `<name>FormSchema.ts` in Effect Schema |
| Local UI state | `useState` or `useReducer` | a `use*` hook |

A component calls its hooks and renders. It holds no state, effect, query,
mutation or form of its own.

The api client is the only web module that names the api. Everything else
reaches the api through `useTrpc()` from `../../api-client`:

```ts
// a query, as in apps/web/src/routes/greeting/useGreeting.ts
const trpc = useTrpc();
const query = useQuery(trpc.greeting.greet.queryOptions(name === null ? skipToken : { name }));

// a mutation that refreshes a query on success
const queryClient = useQueryClient();
const mutation = useMutation(
  trpc.<router>.<procedure>.mutationOptions({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: trpc.<router>.<procedure>.queryKey() }),
  }),
);
```

Route and hook tests render through `TestApiProvider` with one typed handler
per procedure path. They exercise the real hooks and providers, with no mocked
hook. See `apps/web/src/routes/greeting/GreetingPage.test.tsx`:

```tsx
function renderPage(greet: NonNullable<TestApiHandlers['greeting.greet']>) {
  const view = render(
    <TestApiProvider handlers={{ 'greeting.greet': greet }}>
      <GreetingPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}
```

A procedure the test gives no handler fails with
`TestApiProvider has no handler for <path>`.

## The rules (and why)

Each rule fails a check on a seeded violation in a committed test
(`tooling/architecture/boundaries.test.ts`, `scripts/eslint-policy.test.ts`,
`tooling/architecture/typescript.test.ts`). The check's message names the fix.

| Rule | Why | Enforced by | Proved by |
| --- | --- | --- | --- |
| Routes own page composition. | One place per page keeps navigation readable. | ESLint `policy/pages-in-routes`, Fallow `web-routes` | `pnpm lint:policy`, `pnpm arch:gate` |
| Sibling slices stand alone: a route imports no other route, a feature no other feature. | Each slice changes without breaking its siblings. | ESLint `policy/slice-isolation` for every result; Fallow child zones for `apps/web` | `pnpm lint:policy`, `pnpm arch:gate` |
| Every file belongs to one role and one slice. | Extra layers and loose files hide structure. | Fallow `coverage.requireAllFiles`; `policy/slice-isolation` for a loose file under `src/routes/` or `src/features/` | `pnpm arch:gate`, `pnpm lint:policy` |
| A package reaches another only by its package name. | Public exports are the only contract. | `policy/slice-isolation` (relative import out of the package) | `pnpm lint:policy` |
| A module is imported through its `index.ts`. | The public surface is a deliberate, reviewed list. | ESLint `no-restricted-imports`; API reports | `pnpm lint:policy`, `pnpm api:check` |
| Procedures validate their input with Effect Schema. | Data from the network is untrusted until parsed. | ESLint `policy/procedure-input-schema` | `pnpm lint:policy` |
| Procedures delegate to application logic. | Transport stays thin; logic stays testable. | Fallow `api-procedures` value-imports only `api-trpc`, `api-application` | `pnpm arch:gate` |
| The domain is pure, and application knows no tRPC. | Rules test as plain functions. | Fallow `api-domain`; `contract/domain-pure`, `contract/application-without-trpc`; `tsconfig.domain.json` (no Node types) | `pnpm arch:gate`, `pnpm fallow:audit`, `pnpm typecheck` |
| Effects run only in integrations or the api composition root. | One place to swap storage or IO. | `contract/effects-in-integrations`, `contract/io-effects-in-integrations`, `contract/node-io-in-integrations` | `pnpm arch:gate`, `pnpm fallow:audit` |
| The web reaches the api only through the api client and the router type. | The bundle carries no server code. | Fallow `allowTypeOnly`; the `types`-only export of `@repo/api`; `contract/trpc-client-in-api-client`, `contract/trpc-server-off-the-web` | `pnpm arch:gate`, `pnpm fallow:audit` |
| UI primitives hold no business logic. | The kit stays reusable across results. | Fallow `ui` imports nothing; `contract/ui-without-logic` | `pnpm arch:gate`, `pnpm fallow:audit` |
| One React component per file. | One file, one reason to change. | ESLint `policy/one-component-per-file` | `pnpm lint:policy` |
| State, server state and form state live in `use*` hooks. | Components render; hooks wire. | ESLint `policy/state-and-effects-in-hooks` | `pnpm lint:policy` |
| Forms validate with Effect Schema. | One schema language across web and api. | ESLint `policy/form-uses-effect-schema` | `pnpm lint:policy` |
| Web code has the DOM and no Node; api code has no DOM and only erasable syntax; domain code has neither. | The browser has no Node, and Node strips types and runs the source as is. | `tsconfig.json` (web, ui), `tsconfig.api.json` and `tsconfig.domain.json` over `tsconfig.base.json` | `pnpm typecheck` |
| Behaviour is defined by each result's E2E specs. | The product contract survives refactors. | Playwright, one project per result | `pnpm e2e` |

`contract/<id>` is a rule in
[`tooling/architecture/contract.rules.jsonc`](../../tooling/architecture/contract.rules.jsonc),
which Fallow loads as a rule pack and reports as an error. The behaviour map
is each result's `web/e2e/*.spec.ts`, for example
[`apps/web/e2e/greeting.spec.ts`](../../apps/web/e2e/greeting.spec.ts); see
[ADR 0003](../decisions/0003-behaviour-mapped-with-e2e.md).

## Architecture checks

`pnpm arch:check` runs in `pnpm verify` and runs three checks over the rules
file:

- `pnpm arch:gate` runs `fallow architecture` and exits 1 on a forbidden import
  or a file in no role. It then runs the structure check above and
  `diagram.mjs --check`, which exits 1 on a missing, stale or extra diagram.
- `pnpm arch:diagram` regenerates
  [`docs/architecture/roles.mmd`](../../docs/architecture/roles.mmd) and every
  result's `architecture.mmd`. Commit the result; CI fails when a committed copy
  differs from a fresh run.
- `pnpm api:check` compares the API reports with the code. `pnpm api:report`
  rewrites them per package: the package entry gives
  `<package>/etc/<name>.api.md` (`apps/api/etc/api.api.md`), and each route,
  feature and api-client `index.ts` gives `<package>/etc/<folder>-<name>.api.md`
  (`apps/web/etc/routes-greeting.api.md`, `apps/api/etc/features-greeting.api.md`,
  `apps/web/etc/api-client.api.md`). Commit the reports with the change.

`pnpm arch:gate` also reports the `contract/<id>` rules in every file an entry
point reaches. `pnpm fallow:audit` runs them over the files a change touches,
with `audit.gate: "all"`, so it fails every finding there, inherited ones
included.

## What this template intentionally omits

The template leaves out a router library, a store, a database and auth. They
are stack choices, not agentic principles. A result keeps its data in memory
inside `integrations.ts`. When you add one of them, record the choice as an ADR
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
   `.input(Schema.standardSchemaV1(schema))`.
2. End with `.query(...)` for a read and `.mutation(...)` for a write, and
   delegate to one application function.
3. Cover the valid input and the rejected input (`BAD_REQUEST`) in
   `procedures.test.ts`.

### Add a route

1. Create `apps/web/src/routes/<route-name>/` with `<Name>Page.tsx` and an
   `index.ts` that exports the page.
2. Put server state in `use<Name>.ts` through `useTrpc()`, form state in
   `use<Name>Form.ts` and `<name>FormSchema.ts`, and each component in its own
   file built from `@repo/ui` primitives.
3. Test the page and hooks through `TestApiProvider`.
4. Mount the page in `apps/web/src/App.tsx`.
5. Specify the behaviour in `apps/web/e2e/<route-name>.spec.ts`. Playwright
   runs every spec in that folder.

### Add a web feature

Create `apps/web/src/features/<feature-name>/` with an `index.ts` when web code
is reused across routes. It may import the api client and `@repo/ui`; routes
import it through its `index.ts`.

### Finish

1. Run `pnpm api:report` and commit the new or changed `etc/*.api.md`.
2. Run `pnpm arch:diagram` and commit `apps/architecture.mmd` and
   `docs/architecture/roles.mmd` when they change.
3. `pnpm verify` and `pnpm e2e` pass before you call it done.
