# Tech stack

Each concern has one owner. Use that tool for its job; adding or swapping a
tool needs an ADR. [QUALITY_GATES.md](QUALITY_GATES.md) lists where each runs.

| Concern | Owner | Notes |
| --- | --- | --- |
| Language and typecheck | **TypeScript 7.0.2** (`strict`, `pnpm typecheck`) | Run `node node_modules/@typescript/native/bin/tsc` by path through the exact `npm:typescript@7.0.2` alias. TypeScript 5.9.3 stays as a library for Jest's ts-node loader, commitlint's config loader and React Doctor. |
| Workspace | **pnpm workspaces** | `apps/*`, `packages/*` and each showcase result (`showcase/*/web`, `showcase/*/api`); the root configs own every gate. |
| UI | **React 19** | Function components + hooks only. |
| UI primitives | **`@repo/ui`** (`packages/ui`) | `Button`, `TextField` and `styles.css`; `react` and `tailwindcss` are its peers. |
| Styling and design tokens | **Tailwind CSS 4** (`tailwindcss`, `@tailwindcss/vite`) | Utility classes on the theme scale. The `@theme` block in `packages/ui/src/styles.css` holds every colour, radius and font token; each web `src/index.css` imports it. `pnpm lint:policy` and `pnpm lint:styles` reject arbitrary values, inline styles and colour literals ([ADR 0114](../decisions/0114-tailwind-on-the-ui-design-tokens.md)). |
| Build / dev server | **Vite** | The runnable carrier; the scaffolding is stack-agnostic. Its dev and preview servers proxy `/trpc` to `API_ORIGIN` (default `http://127.0.0.1:3001`). |
| Api runtime | **Node ≥ 22.18 native type stripping** | `node src/server.ts` runs the api source as is, with no runner, build step or bundler. Api code uses erasable syntax and `.ts` import extensions. |
| Api transport | **tRPC v11** (`@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`) | `@trpc/server` in the api; the client packages only in each result's `web/src/api-client/`. The web imports the api as the `AppRouter` type only. |
| Web-to-api contract | **The shared `AppRouter` type** (`pnpm typecheck`) | Each result's `api/src/router.ts` exports it, and the web imports it type-only, so a changed procedure input or output fails typecheck in every web caller. Route and hook tests answer calls through `TestApiProvider`, whose `TestApiHandlers` (`web/src/api-client/testApiHandlers.ts`) take their types from the router. The Playwright behaviour map (`playwright.config.ts`) runs each result's web app against its real api. |
| Server state | **TanStack Query** (`@tanstack/react-query`) | Through `useTrpc()` with `queryOptions` and `mutationOptions`, inside `use*` hooks. |
| Forms | **React Hook Form** + **`@hookform/resolvers`** | `useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema)) })` with `standardSchemaResolver` from `@hookform/resolvers/standard-schema`. |
| Validation and schemas | **Effect 4 Schema** (`effect`, pinned `^4.0.5`) | Procedure inputs (`Schema.toStandardSchemaV1`), form schemas, and environment parsing. |
| Unit / component / contract / integration tests | **Jest + React Testing Library + Pact 17.1.4** | Five projects: `web` (jsdom), `api` (node), `tooling`, `contract` (Pact consumer/provider), and `integration` (node, real HTTP server). Unit and coverage commands select `web api tooling`; `pnpm test:integration` runs the HTTP tests once in `verify` and in its own required CI lane. |
| End-to-end tests | **Playwright** | The behaviour map: one Chromium project per result, running its api and web servers. |
| Format, import order, general lint | **Biome** | The one formatter and the general-purpose linter. |
| Policy, React hooks, React Compiler, and React Doctor lint rules | **Oxlint** (`pnpm lint:policy`) | Oxlint runs repository policy, native hooks and Compiler rules (`react/*`), and React Doctor rules through `oxlint-plugin-react-doctor`. Core mutation and loop checks cover all sources; depth and public surfaces cover result sources, including showcase. See [React Doctor rules run as an Oxlint plugin](../decisions/0102-react-doctor-rules-run-as-an-oxlint-plugin.md). |
| React Doctor project checks | **React Doctor CLI** (`pnpm react-doctor`) | The cross-file and project checks outside the per-file plugins. |
| Low-evidence TypeScript patterns (anti-slop rules) | **Oxlint** with the vendored plugin in `vendor/anti-slop/` (`pnpm lint:anti-slop`) | The anti-slop config runs only vendored plugins and skips showcase. The separate policy config covers showcase during the swap ([ADR 0098](../decisions/0098-oxlint-replaces-eslint.md)). |
| Commit format | **commitlint** | Conventional Commits on `commit-msg`. |
| Code intelligence and architecture | **Fallow** | Dead code, cycles, complexity, the dependency graph, the architecture gate (`pnpm arch:gate`), the contract rule pack (`contract/<id>`), and the role diagram (`pnpm arch:diagram`). |
| Exported API reports | **API Extractor** | One committed `<package>/etc/*.api.md` per public entry of each package (`pnpm api:report`, `pnpm api:check`). |
| Accessibility | **jest-axe + @axe-core/playwright** | axe at unit level and in the real browser (contrast). |
| Bundle-size budget | **size-limit** | Fails CI when `apps/web/dist/` exceeds the budget. |
| Visual regression | **Playwright screenshot comparisons** | `pnpm visual` on UI-relevant PRs; reviewed PNG baselines, reference result only (ADR 0052). |
| Performance budget | **Lighthouse CI** | a11y floor + perf budget on UI-relevant pull requests. |
| Git hooks | **husky** | Runs the gates locally before commit/push. |
| Dependency vulnerabilities | **`pnpm audit`** | High/critical advisories fail CI. |
| Secret scanning | **gitleaks** | Staged content on pre-commit; full history in CI. |
| Static application security | **CodeQL** | SAST on every push and pull request. |
| License compliance | **pnpm licenses + allow-list** | `pnpm --recursive licenses list` covers every workspace package; CI fails on a dependency license outside the permissive allow-list. |
| Automated PR review rules | **`REVIEW.md`** | The judgment rules Cursor Bugbot, Codex, and Claude read after lint; `AGENTS.md` and `.cursor/BUGBOT.md` point every reviewer at the one file, and `pnpm check:context` holds the wiring ([ADR 0049](../decisions/0049-review-rules-for-bot-reviewers.md)). |

## Why these choices

- `@hookform/resolvers` declares an Effect peer of `^3.10.3`, so `effectTsResolver` supports Effect 3 only. Use `standardSchemaResolver(Schema.toStandardSchemaV1(schema))` for Effect 4 forms, with the same adapter as api procedures. The web bundle is about 26 kB smaller than on Effect 3 and fits the 110 kB budget ([ADR 0036](../decisions/0036-effect-4.md)).
- Node 22.18 is the first Node 22 release to strip types by default. `engines.node` sets that floor; `.nvmrc` stays `22`. If `nvm use` selects an older 22.x, run `nvm install` to get the newest Node 22.
- The Vite proxy lets the browser call `/trpc` on its own origin, with no CORS setup or api URL in the bundle.
- The web and api share one workspace, release and `AppRouter` type. Typecheck checks each call against the provider; the behaviour map exercises real HTTP. Pact and other consumer-driven contract tools stay out of scope until a consumer or provider ships from another repository; adding one then needs an ADR.

## Boundaries to respect

- Each lint rule has one owner. Biome owns formatting and general lint; Oxlint owns policy, React hooks, Compiler and React Doctor rules; the React Doctor CLI owns project checks ([ADR 0010](../decisions/0010-lint-engine-ownership.md), [ADR 0015](../decisions/0015-eslint-policy-stack-wiring.md)). Biome is the only formatter.
- Use Jest for unit tests and Playwright for E2E. A new runner needs an ADR (`pnpm check:adr`). Unit tests assert behaviour and stub stylesheets through `tooling/jest/jest.style-stub.cjs`.
- Keep server state in TanStack Query, form state in React Hook Form, validation in Effect Schema, transport in tRPC, and primitives in `@repo/ui`.
- A router library, global store, second schema library (such as zod), second data-fetching library, database client, ORM, auth library or TypeScript runner (`tsx`, `ts-node` for the api) each needs an ADR first. A result keeps its data in memory in the feature's `integrations.ts`.

External tools: see the [README](../../README.md) for Fallow-skill installation hints; reference these libraries without vendoring them ([ADR 0004](../decisions/0004-agent-context-lives-in-dot-agents.md)).
