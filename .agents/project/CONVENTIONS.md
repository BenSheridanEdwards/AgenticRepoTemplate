# Conventions

Use [AGENTS.md's rule table](../../AGENTS.md#rules-and-what-enforces-them) for shared rules and gates. The tables below cover code conventions; reviewers hold the judgment calls. Copy the reference feature when in doubt.

## Enforced conventions

The ESLint rules and Biome naming override run on `{apps,packages}/*/src/**` and `showcase/*/*/src/**`; package ESLint policy and React rules cover `.ts` and `.tsx`.

| Convention | Enforced by |
| --- | --- |
| Replace a module through a dependency seam such as `TestApiProvider`; `jest.mock` fails the gate. | Oxlint `anti-slop/no-module-mocking` (`pnpm lint:anti-slop`) |
| Parse a boundary value with Effect Schema before branching on it. | Oxlint `anti-slop/no-runtime-typeof` in package sources (`pnpm lint:anti-slop`) rejects runtime `typeof`; review checks the boundary parser. |
| Folders under a package `src/` are kebab-case (`name-input`). | ESLint `policy/folder-names` |
| Each folder under a package `src/` is named for its role (`name-input`, `api-client`). Code in a catch-all folder (`utils`, `helpers`, `lib`, `common`, `shared`, `misc`) moves into the slice that uses it, or into `@repo/ui` when it is a shared UI primitive. | ESLint `policy/role-named-folders` |
| Each test sits beside its subject as `<Name>.test.ts(x)` or `<Name>.<kind>.test.ts(x)` (`GreetingPage.a11y.test.tsx` beside `GreetingPage.tsx`), outside any `__tests__/` folder. A source file with no test is fine; coverage thresholds decide what is tested. | ESLint `policy/test-beside-subject` |
| Identifiers: `camelCase` functions and variables, `PascalCase` types and components, `SCREAMING_SNAKE_CASE` for true configuration constants. | Biome `style/useNamingConvention` |
| File names are camelCase, PascalCase, or the name of their export. | Biome `style/useFilenamingConvention` |
| A component or hook lives in the file of the same name (`GreetingForm.tsx`, `useGreeting.ts`). | ESLint `policy/file-matches-export` |
| Keep block nesting to four levels. | ESLint `max-depth` |
| Bind with `const` unless the name is reassigned. | Biome `style/useConst` |
| Components and hooks leave props, state, hook values and globals unchanged during render. | ESLint `react-hooks/immutability`, `react-hooks/globals`, `react-hooks/purity` |
| Use `@repo/ui` Button and TextField for native buttons and inputs; checkbox/radio inputs use native elements until dedicated primitives exist. UI definitions and test harnesses may use native controls. | ESLint `policy/use-ui-primitives` |
| One React component per file. | ESLint `policy/one-component-per-file` |
| Function components only. | ESLint `react-doctor/prefer-function-component` |
| `useState`, `useReducer`, effects, TanStack Query hooks (`useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`) and React Hook Form hooks (`useForm`, `useFieldArray`) run only inside a named custom `use*` hook. | ESLint `policy/state-and-effects-in-hooks` ([ADR 0012](../decisions/0012-local-state-inside-custom-hooks.md)) |
| `useForm` takes `resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema))`, with `standardSchemaResolver` from `@hookform/resolvers/standard-schema` and `Schema` from `effect`. | ESLint `policy/form-uses-effect-schema` |
| Every api procedure input is `.input(Schema.toStandardSchemaV1(schema))` with `Schema` from `effect`. | ESLint `policy/procedure-input-schema` |
| Derived values are computed during render instead of copied into state by an effect. | ESLint `react-hooks/set-state-in-effect`, `react-doctor/no-derived-state`, `react-doctor/no-mirror-prop-effect` |
| Functions defined inside a component start with `handle` (`handleGreet`). | ESLint `policy/handler-names` |
| Callback props start with `on` (`onGreet`). | ESLint `policy/callback-prop-names` |
| Page components (`<Name>Page`) live in `src/routes/<route-name>/`. | ESLint `policy/pages-in-routes`, Fallow `web-routes` zone |
| Each file under `src/routes/` or `src/features/` sits in a slice folder, and a slice imports no sibling slice. | ESLint `policy/slice-isolation` for static relative module references; Fallow child zones for `apps/web` routes. Computed specifiers and non-relative aliases remain a gap in the ESLint rule. |
| A relative import stays inside its package; other packages are imported by name (`@repo/ui`). | ESLint `policy/slice-isolation` |
| Another module imports a route, feature or api feature only through its `index.ts`: `./routes/greeting` in the web, `./features/greeting/index.ts` in the api. | ESLint `no-restricted-imports` |
| Every relative import in an api package names its `.ts` extension (`./application.ts`). | `pnpm typecheck` (`tsconfig.api.json`, `NodeNext`) and Node at runtime |
| Api code uses only erasable TypeScript syntax and sees no DOM; web code has the DOM and no Node globals. | `pnpm typecheck` (`tsconfig.api.json` with `erasableSyntaxOnly`; `tsconfig.json` with the DOM libs and no Node types) |
| Banned imports, calls and effects per role. | Fallow rule pack, reported as `contract/<id>` (`pnpm arch:gate`, `pnpm fallow:audit`) |
| `strict` TypeScript with `noUncheckedIndexedAccess` and `noUnusedLocals`. | `pnpm typecheck`; review of the diff catches a loosened `tsconfig.base.json` ([ADR 0023](../decisions/0023-protect-only-the-files-that-run-the-gates.md)) |
| `unknown` and narrowing in place of `any`. | Biome `suspicious/noExplicitAny` |
| `import type` for type-only imports. | Biome `style/useImportType`, `verbatimModuleSyntax` |
| `interface` for object shapes, `type` for unions and aliases. | Biome `style/useConsistentTypeDefinitions` |
| Import order. | Biome `organizeImports` |
| Every block has a body; a handled error does something observable. | Biome `suspicious/noEmptyBlockStatements` |
| Use no `fallow-ignore` comment. | `pnpm check:suppressions`; the structure check also rejects this directive in result roots. |
| Accessible, labelled controls and status regions. | Biome `a11y/*`, jest-axe, `@axe-core/playwright`, Lighthouse |

Comment groups count physical lines and adjacent mixed syntaxes together. Imports within a role still follow slice isolation.

## Contract rules

The [Fallow rule pack](../../tooling/architecture/contract.rules.jsonc) reports each finding as `policy-violation` `contract/<id>`, an error. Tests are outside every rule.

| Rule id | What it keeps |
| --- | --- |
| `contract/domain-pure` | `domain.ts` imports no `@trpc/server`, no `effect` and no Node module. `tsconfig.domain.json` also gives it no Node globals. |
| `contract/application-without-trpc` | `application.ts` imports no `@trpc/server`; procedures map errors to tRPC. |
| `contract/effects-in-integrations` | `fetch`, `self.fetch`, `Effect.runPromise`, `Effect.runSync` and `Effect.runFork` run only in `integrations.ts` or the api `server.ts` and `router.ts`. |
| `contract/io-effects-in-integrations` | Network, storage, process and shell work runs only there too. |
| `contract/node-io-in-integrations` | Node IO modules (`fs`, `http`, `net`, `child_process`) are imported only there too. |
| `contract/trpc-client-in-api-client` | `@trpc/client` and `@trpc/tanstack-react-query` are imported only in `web/src/api-client/`. |
| `contract/trpc-server-off-the-web` | Web and ui code imports `@trpc/server` only in `web/src/api-client/`. |
| `contract/ui-without-logic` | `packages/ui` imports no query, form, schema or tRPC library. |

## State ownership

| State | Owner | File |
| --- | --- | --- |
| Server state | TanStack Query through `useTrpc()` from the api client, with `queryOptions` or `mutationOptions` | `use<Name>.ts` in the route folder (`useGreeting.ts`) |
| Form state | React Hook Form with `standardSchemaResolver(Schema.toStandardSchemaV1(schema))` and `defaultValues` | `use<Name>Form.ts` (`useGreetingForm.ts`) |
| Form schema | Effect Schema | `<name>FormSchema.ts` (`greetingFormSchema.ts`) |
| Local UI state | `useState` or `useReducer` | a `use*` hook |

After a mutation, refresh the queries it changes in `onSuccess` with `queryClient.invalidateQueries({ queryKey: trpc.<router>.<procedure>.queryKey() })`.

## Api file roles

| File | Holds |
| --- | --- |
| `features/<name>/procedures.ts` | The feature router. Validates each input with `Schema.toStandardSchemaV1` and delegates to application. |
| `features/<name>/application.ts` | Use cases. Calls domain and integrations; knows no transport. |
| `features/<name>/domain.ts` | Pure types and rules. |
| `features/<name>/integrations.ts` | Storage, including in-memory storage, and every effect. |
| `features/<name>/index.ts` | The public surface: the feature router. |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full role table and greeting reference.

## Judgment calls

- Use full words such as `name` and `request` in identifiers. Established acronyms such as E2E, CI, ADR, UI, IO, and URL are fine.
- Hooks wire state, components render, and pure functions hold logic. See [`ARCHITECTURE.md`](ARCHITECTURE.md).
- Build controls with `@repo/ui`'s `Button` and `TextField`; add a primitive to `packages/ui` when a result needs a new one.
- Parse network, storage, and environment data at the IO boundary before trusting its type. `server.ts` decodes `PORT` with Effect Schema; a type assertion alone proves nothing.
- Fail loudly at boundaries, as `main.tsx` does when `#root` is missing.
- Build arrays and objects with `map`, `filter`, `flatMap`, `reduce` and `Object.fromEntries` in place of loops, `push` and in-place mutation. `style/useConst` and React Hooks rules enforce part of this; review holds the rest ([North Star §9](../../docs/NORTH_STAR.md#9-declarative-over-imperative)).
- Keep comments for the local reason behind a line. Record decisions, alternatives and trade-offs in an [ADR](../decisions/).

## Enforced commit and branch conventions

Use Conventional Commits, `type(scope): subject`, lower case with no trailing period (commitlint on `commit-msg`). Branches are `<type>/<short-kebab-summary>`, such as `feat/greeting-trim-name` (`PR quality`, `scripts/validate-pr-body.mjs`).
Write subjects in the imperative mood and keep one logical change per commit.
