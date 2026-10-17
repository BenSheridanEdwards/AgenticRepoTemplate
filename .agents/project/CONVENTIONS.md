# Conventions

Each convention below names the check that enforces it. The error message of
each check names the fix. The judgment calls at the end are the conventions no
check can decide; reviewers hold those. When in doubt, copy the reference
feature.

## Enforced conventions

The ESLint rules and the Biome naming override run on every package source:
`{apps,packages}/*/src/**` and `showcase/*/*/src/**`.

| Convention | Enforced by |
| --- | --- |
| Folders under a package `src/` are kebab-case (`name-input`). | ESLint `policy/folder-names` |
| Identifiers: `camelCase` functions and variables, `PascalCase` types and components, `SCREAMING_SNAKE_CASE` for true configuration constants. | Biome `style/useNamingConvention` |
| File names are camelCase, PascalCase, or the name of their export. | Biome `style/useFilenamingConvention` |
| A component or hook lives in the file of the same name (`GreetingForm.tsx`, `useGreeting.ts`). | ESLint `policy/file-matches-export` |
| One React component per file. | ESLint `policy/one-component-per-file` |
| Function components only. | ESLint `react-doctor/prefer-function-component` |
| `useState`, `useReducer`, effects, TanStack Query hooks (`useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`) and React Hook Form hooks (`useForm`, `useFieldArray`) run only inside a named custom `use*` hook. | ESLint `policy/state-and-effects-in-hooks` ([ADR 0012](../decisions/0012-local-state-inside-custom-hooks.md)) |
| `useForm` takes `resolver: effectTsResolver(schema)` from `@hookform/resolvers/effect-ts`. | ESLint `policy/form-uses-effect-schema` |
| Every api procedure input is `.input(Schema.standardSchemaV1(schema))` with `Schema` from `effect`. | ESLint `policy/procedure-input-schema` |
| Derived values are computed during render instead of copied into state by an effect. | ESLint `react-hooks/set-state-in-effect`, `react-doctor/no-derived-state`, `react-doctor/no-mirror-prop-effect` |
| Functions defined inside a component start with `handle` (`handleGreet`). | ESLint `policy/handler-names` |
| Callback props start with `on` (`onGreet`). | ESLint `policy/callback-prop-names` |
| Page components (`<Name>Page`) live in `src/routes/<route-name>/`. | ESLint `policy/pages-in-routes`, Fallow `web-routes` zone |
| Each file under `src/routes/` or `src/features/` sits in a slice folder, and a slice imports no sibling slice. | ESLint `policy/slice-isolation`, Fallow child zones for `apps/web` |
| A relative import stays inside its package; other packages are imported by name (`@repo/ui`). | ESLint `policy/slice-isolation` |
| Another module imports a route, feature or api feature only through its `index.ts`: `./routes/greeting` in the web, `./features/greeting/index.ts` in the api. | ESLint `no-restricted-imports` |
| Every relative import in an api package names its `.ts` extension (`./application.ts`). | `pnpm typecheck` (`tsconfig.api.json`, `NodeNext`) and Node at runtime |
| Api code uses only erasable TypeScript syntax and sees no DOM; web code has the DOM. | `pnpm typecheck` (`tsconfig.api.json` with `erasableSyntaxOnly`, `tsconfig.json` with the DOM libs) |
| Every source file belongs to one architecture role. | Fallow `coverage.requireAllFiles` (`pnpm arch:gate`) |
| Imports follow the role table in [`ARCHITECTURE.md`](ARCHITECTURE.md). | Fallow boundaries (`pnpm arch:gate`) |
| Banned imports, calls and effects per role. | Fallow rule pack, reported as `contract/<id>` (`pnpm arch:gate`, `pnpm fallow:audit`) |
| `strict` TypeScript with `noUncheckedIndexedAccess` and `noUnusedLocals`. | `pnpm typecheck`; review of the diff catches a loosened `tsconfig.base.json` ([ADR 0023](../decisions/0023-protect-only-the-files-that-run-the-gates.md)) |
| `unknown` and narrowing in place of `any`. | Biome `suspicious/noExplicitAny` |
| `import type` for type-only imports. | Biome `style/useImportType`, `verbatimModuleSyntax` |
| `interface` for object shapes, `type` for unions and aliases. | Biome `style/useConsistentTypeDefinitions` |
| Import order. | Biome `organizeImports` |
| Every block has a body; a handled error does something observable. | Biome `suspicious/noEmptyBlockStatements` |
| Every lint or type suppression names its rule and carries its reason. | `pnpm check:suppressions`; Biome for `biome-ignore` |
| Every `fallow-ignore` comment names its reason. | Fallow `require-suppression-reason` |
| Accessible, labelled controls and status regions. | Biome `a11y/*`, jest-axe, `@axe-core/playwright`, Lighthouse |

## Contract rules

The Fallow rule pack
[`tooling/architecture/contract.rules.jsonc`](../../tooling/architecture/contract.rules.jsonc)
reports each finding as `policy-violation` `contract/<id>`, an error. Tests are
outside every rule.

| Rule id | What it keeps |
| --- | --- |
| `contract/domain-pure` | `domain.ts` imports no `@trpc/server`, no `effect` and no Node module. |
| `contract/application-without-trpc` | `application.ts` imports no `@trpc/server`; procedures map errors to tRPC. |
| `contract/effects-in-integrations` | `fetch`, `Effect.runPromise`, `Effect.runSync` and `Effect.runFork` run only in `integrations.ts` or the api `server.ts` and `router.ts`. |
| `contract/io-effects-in-integrations` | Network, storage, process and shell work runs only there too. |
| `contract/node-io-in-integrations` | Node IO modules (`fs`, `http`, `net`, `child_process`) are imported only there too. |
| `contract/trpc-client-in-api-client` | `@trpc/client` and `@trpc/tanstack-react-query` are imported only in `web/src/api-client/`. |
| `contract/trpc-server-off-the-web` | Web and ui code imports `@trpc/server` only in `web/src/api-client/`. |
| `contract/ui-without-logic` | `packages/ui` imports no query, form, schema or tRPC library. |

## State ownership

| State | Owner | File |
| --- | --- | --- |
| Server state | TanStack Query through `useTrpc()` from the api client, with `queryOptions` or `mutationOptions` | `use<Name>.ts` in the route folder (`useGreeting.ts`) |
| Form state | React Hook Form with `effectTsResolver(schema)` and `defaultValues` | `use<Name>Form.ts` (`useGreetingForm.ts`) |
| Form schema | Effect Schema | `<name>FormSchema.ts` (`greetingFormSchema.ts`) |
| Local UI state | `useState` or `useReducer` | a `use*` hook |

After a mutation, refresh the queries it changes in `onSuccess` with
`queryClient.invalidateQueries({ queryKey: trpc.<router>.<procedure>.queryKey() })`.

## Api file roles

| File | Holds |
| --- | --- |
| `features/<name>/procedures.ts` | The feature router. Validates each input with `Schema.standardSchemaV1` and delegates to application. |
| `features/<name>/application.ts` | Use cases. Calls domain and integrations; knows no transport. |
| `features/<name>/domain.ts` | Pure types and rules. |
| `features/<name>/integrations.ts` | Storage, including in-memory storage, and every effect. |
| `features/<name>/index.ts` | The public surface: the feature router. |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full role table and the
greeting reference.

## Judgment calls

- **Full words in identifiers.** Write `name` and `request`. The name is the
  cheapest documentation an agent has. Established acronyms such as E2E, CI,
  ADR, UI, IO, and URL are fine.
- **Hooks wire state, components render, pure functions hold logic.** See
  [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Build with `@repo/ui` primitives.** Use `Button` and `TextField` for
  controls, and add a primitive to `packages/ui` when a result needs a new one.
- **Validate data at an IO boundary.** Parse network, storage, and environment
  data before trusting its type, as `server.ts` decodes `PORT` with Effect
  Schema. A type assertion is a claim, and validation is proof.
- **Fail loudly at boundaries.** `main.tsx` throws when `#root` is missing.
- **Co-locate tests.** Each test sits beside its subject as `<Name>.test.ts(x)`.

## Enforced commit and branch conventions

| Convention | Enforced by |
| --- | --- |
| Commits use Conventional Commits, `type(scope): subject`, lower case with no trailing period. | commitlint on `commit-msg` |
| PR titles use Conventional Commits. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| Branches are `<type>/<short-kebab-summary>`, for example `feat/greeting-trim-name`. | `PR quality` workflow (`scripts/validate-pr-body.mjs`) |
| A new dependency arrives with a new ADR that names it. | `pnpm check:adr` in `pnpm verify` and CI |

## Commit judgment

- Write the subject in the imperative mood.
- Keep one logical change per commit, so the diff stays reviewable.
