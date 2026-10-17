# Tech stack — one tool per concern

The point of this list is not the tools; it is that **each concern has exactly
one owner**. An agent knows which tool to reach for, and keeps each job with
the one tool that owns it. Adding or swapping a tool
is an ADR-level decision. See [`QUALITY_GATES.md`](QUALITY_GATES.md) for where
each owner runs locally and in CI.

| Concern | Owner | Notes |
| --- | --- | --- |
| Language | **TypeScript** (`strict`) | The first quality gate is the type system. |
| Workspace | **pnpm workspaces** | `apps/*`, `packages/*` and each showcase result (`showcase/*/web`, `showcase/*/api`); the root configs own every gate. |
| UI | **React 19** | Function components + hooks only. |
| UI primitives | **`@repo/ui`** (`packages/ui`) | `Button`, `TextField` and `styles.css`; `react` is its only peer. |
| Build / dev server | **Vite** | The runnable carrier; the scaffolding is stack-agnostic. Its dev and preview servers proxy `/trpc` to `API_ORIGIN` (default `http://127.0.0.1:3001`). |
| Api runtime | **Node ≥ 22.18 native type stripping** | `node src/server.ts` runs the api source as is, with no runner, build step or bundler. Api code uses erasable syntax and `.ts` import extensions. |
| Api transport | **tRPC v11** (`@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`) | `@trpc/server` in the api; the client packages only in each result's `web/src/api-client/`. The web imports the api as the `AppRouter` type only. |
| Server state | **TanStack Query** (`@tanstack/react-query`) | Through `useTrpc()` with `queryOptions` and `mutationOptions`, inside `use*` hooks. |
| Forms | **React Hook Form** + **`@hookform/resolvers`** | `useForm({ resolver: effectTsResolver(schema) })` from `@hookform/resolvers/effect-ts`. |
| Validation and schemas | **Effect 3.x Schema** (`effect`, pinned `^3.22.3`) | Procedure inputs (`Schema.standardSchemaV1`), form schemas, and environment parsing. |
| Unit / component tests | **Jest + React Testing Library** | Three projects: `web` (jsdom), `api` (node), `tooling`. Behaviour through the accessibility tree. |
| End-to-end tests | **Playwright** | The behaviour map: one Chromium project per result, running its api and web servers. |
| Format, import order, general lint | **Biome** | The one formatter and the general-purpose linter. |
| Policy, React hooks, React Compiler, and React Doctor lint rules | **ESLint** (`pnpm lint:policy`) | `eslint-plugin-react-hooks`, `eslint-plugin-react-doctor`, and the local `tooling/eslint-plugin-policy.js` on `{apps,packages}/*/src/` and `showcase/*/*/src/`; see ADR 0015 for each rule's owner and ADR 0019 for the local rules. |
| React Doctor project checks | **React Doctor CLI** (`pnpm react-doctor`) | The cross-file and project checks outside the ESLint plugin. |
| Commit format | **commitlint** | Conventional Commits on `commit-msg`. |
| Code intelligence and architecture | **Fallow** | Dead code, cycles, complexity, the dependency graph, the architecture gate (`pnpm arch:gate`), the contract rule pack (`contract/<id>`), and the role diagram (`pnpm arch:diagram`). |
| Exported API reports | **API Extractor** | One committed `<package>/etc/*.api.md` per public entry of each package (`pnpm api:report`, `pnpm api:check`). |
| Accessibility | **jest-axe + @axe-core/playwright** | axe at unit level and in the real browser (contrast). |
| Bundle-size budget | **size-limit** | Fails CI when `apps/web/dist/` exceeds the budget. |
| Performance budget | **Lighthouse CI** | a11y floor + perf budget on UI-relevant pull requests. |
| Git hooks | **husky** | Runs the gates locally before commit/push. |
| Dependency vulnerabilities | **`pnpm audit`** | High/critical advisories fail CI. |
| Secret scanning | **gitleaks** | Staged content on pre-commit; full history in CI. |
| Static application security | **CodeQL** | SAST on every push and pull request. |
| License compliance | **pnpm licenses + allow-list** | `pnpm --recursive licenses list` covers every workspace package; CI fails on a dependency license outside the permissive allow-list. |
| Dependency updates | **Dependabot** | Weekly npm + GitHub-Actions update PRs. |
| Repo health audits | **ArchitectPlaybook** | Claude Code skills; the health-check (showcase #1). |
| Codebase knowledge graph | **graphify** | Powers ArchitectPlaybook's `/pre-audit-setup`. |
| Execution-flow index | **GitNexus** | Local generated index for impact, trace, and context queries. |
| Simplicity discipline | **Ponytail** | Prefer deletion, stdlib/native features, and existing patterns. |

## Why these choices

- **Effect 3, not Effect 4.** ADR 0011 names `Schema.standardSchemaV1` and
  `effectTsResolver`, and `@hookform/resolvers` declares its Effect peer as
  `^3.10.3`, so `effectTsResolver` runs on Effect 3 only. Effect 4 with
  `standardSchemaResolver` would be smaller, and moving to it is an ADR-level
  change ([ADR 0032](../decisions/0032-api-ui-greeting-and-contract.md)).
- **Native type stripping, no runner.** Node 22.18 is the first Node 22 that
  strips types by default. `engines.node` is `>=22.18`, the floor, and `.nvmrc`
  stays `22`. Locally, `nvm use` can pick an installed 22.x older than 22.18,
  where the api fails to start; `nvm install` gets the newest Node 22.
- **The Vite proxy.** The browser calls `/trpc` on its own origin, so the web
  app needs no CORS setup and no api URL in its bundle.

## Boundaries to respect

- **Each lint rule has one owner.** Biome owns formatting and general lint;
  ESLint owns policy, React hooks, React Compiler, and React Doctor rules; the
  React Doctor CLI owns the project-level checks
  ([ADR 0010](../decisions/0010-lint-engine-ownership.md),
  [ADR 0015](../decisions/0015-eslint-policy-stack-wiring.md)). When two engines
  implement the same check, one turns it off and names the owner. Biome is the
  only formatter.
- **One test runner per layer.** Unit = Jest, E2E = Playwright. That is the
  whole matrix, and `pnpm check:adr` asks for an ADR before a new one lands.
- **The unit suite asserts behaviour.** Unit tests stub stylesheets on purpose
  (`jest.style-stub.cjs`).
- **One owner per app concern.** TanStack Query owns server state, React Hook
  Form owns form state, Effect Schema owns validation, tRPC owns transport, and
  `@repo/ui` owns the primitives. Use these owners for their concern.
- **What to leave out.** A router library, a global store, a second schema
  library (such as zod), a second data-fetching library, a database client, an
  ORM, an auth library and a TypeScript runner (`tsx`, `ts-node` for the api)
  each need an ADR first. A result keeps its data in memory in the feature's
  `integrations.ts`.

External tooling (Fallow, ArchitectPlaybook, graphify, GitNexus, Ponytail) is
documented in the repo root `README.md` and installed via `pnpm setup:agents`. We reference
these as living libraries rather than vendoring copies — see
[`../decisions/0004-agent-context-lives-in-dot-agents.md`](../decisions/0004-agent-context-lives-in-dot-agents.md).
