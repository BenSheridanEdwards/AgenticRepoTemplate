# Glossary — the project's ubiquitous language

Use these terms **exactly**, in identifiers, tests, commits, and prose. Shared
language is how an agent's output reads as if the team wrote it. When a new
domain term appears, add it here in the same change.

| Term | Meaning |
| --- | --- |
| **Result** | A pair of workspace packages, `<root>/web` and `<root>/api`, that together make one app. The reference result is `apps/`; each generated trial result is `showcase/<id>/`. `tooling/results.mjs` lists them. |
| **Role** | One row of the role table in `ARCHITECTURE.md`: a set of files (a Fallow zone) and the roles it may import, such as `web-routes` or `api-domain`. Every source file has exactly one role. |
| **Slice** | One folder under a package's `src/routes/` or `src/features/`, such as `routes/greeting` or `api/src/features/greeting`. A slice imports no sibling slice and exposes itself through `index.ts`. |
| **Route** | A web slice under `web/src/routes/<route-name>/` that owns one page (`<Name>Page.tsx`) and its hooks and components. |
| **Feature** | A capability whose web code stays inside its route folder ([ADR 0075](../.agents/decisions/0075-canonical-colocated-routes.md)). Its api slice lives under `api/src/features/<name>/` with `procedures.ts`, `application.ts`, `domain.ts` and `integrations.ts`. |
| **Global primitive** | Shared route-independent code: `@repo/ui` primitives and the fixed ADR 0054 api-client public surface (`useTrpc`, `RouterInputs`, `RouterOutputs`, test providers). The api-client shares transport wiring without sharing feature state. |
| **Procedure** | One tRPC endpoint, such as `greeting.greet`, declared in a feature's `procedures.ts`. Its path names it in `TestApiProvider` handlers. |
| **Contract** | The architecture rules every result follows, and the checks that enforce them: the Fallow role zones and `contract/<id>` rule pack, the ESLint policy rules, and the TypeScript programs. Listed in `ARCHITECTURE.md`. |
| **Public surface** | The exports in a slice's `index.ts` (or a package's `exports`), the only things other modules may import. Each has a committed API report in `etc/`. |
| **Behaviour map** | The end-to-end specs in each result's `web/e2e/*.spec.ts`, such as `apps/web/e2e/greeting.spec.ts`, that define what the product does. The product contract. |
| **PRD** | A feature's product requirements doc, `docs/prd/<feature>.md`, such as `docs/prd/greeting.md`. It states the feature's intent and links each behaviour to the E2E test that proves it. The behaviour map stays the contract. |
| **Quality gate** | An automated check that can block a commit, a push, or a merge. Gates are code, not guidelines. |
| **Definition of Done** | The checklist in `DEFINITION_OF_DONE.md`; "done" means the gates that enforce it are green. |
| **Greeting** | The reference feature: the user submits a name and the api answers `Hello, <name>!` through `greeting.greet`. |
| **Slop** | Code more complex than the change needs, or code that breaks a convention the repository agreed in `.agents/`. Gates refuse the violations they enforce; review holds the rest. |
| **Software factory** | A repository any agent, on any model or harness, can work in, with executable standards and explicit review-held targets. See `NORTH_STAR.md`. |
