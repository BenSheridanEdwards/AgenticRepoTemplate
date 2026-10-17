# Architecture

> This is the anchor for **showcase #2**: agent-written code must follow the
> patterns described here. When asked to verify or review work, an agent checks
> the change against this document first.

## The shape

This codebase is organised by **feature**, not by technical layer. A feature is
a self-contained vertical slice that owns its UI, its state, and its logic.

```
src/
├── main.tsx                 # composition root, the one place that wires the app to the DOM
├── App.tsx                  # mounts the routes; holds no business logic
├── routes/
│   └── <route-name>/        # one folder per route, kebab-case
│       ├── <Name>Page.tsx         # the page: composes features and shared code
│       └── index.ts               # the route's public surface, imported by the app zone
├── features/
│   └── <feature-name>/      # one folder per feature, kebab-case
│       ├── <Feature>.tsx          # presentational component (the "view")
│       ├── use<Feature>.ts        # state wiring (the React hook)
│       ├── <Feature>.test.tsx     # behaviour test, co-located
│       └── index.ts               # the feature's public surface, the one thing others import
└── shared/
    └── <module-name>/       # cross-feature code, one folder per module
        └── index.ts               # the module's public surface
```
Reference implementation: [`src/features/threshold-counter/`](../../src/features/threshold-counter).

## Roles

[`.fallowrc.jsonc`](../../.fallowrc.jsonc) is the one rules file. Each role is a
Fallow zone, and Fallow fails the build on any import the table does not allow.

| Role | Folder | May import | Fallow zone |
| --- | --- | --- | --- |
| app | `src/main.tsx`, `src/App.tsx`, `src/index.css` | routes | `app` |
| routes | `src/routes/<route-name>/` | features, shared | `routes` (one child zone per folder) |
| features | `src/features/<feature-name>/` | shared | `features` (one child zone per folder) |
| shared | `src/shared/<module-name>/` | its own files | `shared` |

Three checks read the rules file, and `pnpm verify` runs all three through
`pnpm arch:check`:

- `pnpm arch:gate` runs `fallow architecture` and exits 1 on a forbidden import.
- `pnpm arch:diagram` regenerates the role diagram,
  [`docs/architecture/roles.mmd`](../../docs/architecture/roles.mmd), from
  Fallow's import graph. Commit the result; CI fails when the committed copy
  differs from a fresh run.
- `pnpm api:report` rewrites one API Extractor report per public module entry
  (each route, feature, and shared `index.ts`) under [`etc/`](../../etc). Commit the
  result; `pnpm api:check` fails when a report differs from the code, so every
  export change shows up as a reviewed diff.

## The rules (and why)

The gates enforce the first three rules. The last two are judgment calls.

1. **Features are islands.** A feature imports only its own files and
   `src/shared/`. Fallow fails an import from one feature into another, or
   from a feature into the app zone. When two features need the same thing, it
   moves to a `src/shared/` module with its own public surface.

2. **Routes compose pages.** A page component lives in
   `src/routes/<route-name>/` (ESLint `policy/pages-in-routes`). A route
   imports features and shared code, and Fallow fails an import from one route
   into another ([ADR 0013](../decisions/0013-one-role-table-for-structure.md)).

3. **The public surface is `index.ts`.** ESLint `no-restricted-imports` fails
   an import that reaches past a route, feature, or shared module's `index.ts`.
   Adding an export to `index.ts` is a deliberate act, and its API report in
   `etc/` shows the change for review.

4. **Logic is pure and lives apart from React.** Business rules are plain
   functions (`statusForCount`), unit-testable without rendering. Hooks
   (`useThresholdCounter`) *wire* that logic to component state, and ESLint
   `policy/state-and-effects-in-hooks` keeps state and effects inside them.
   Components *render*. This three-way split is why a feature can be fully
   tested at the unit level and is cheap for an agent to reason about.

5. **Behaviour is defined by the E2E map.** What the product *does* is the
   contract in `e2e/app.spec.ts`. Refactor the implementation freely while the
   behaviour map stays green; see
   [`../decisions/0003-behaviour-mapped-with-e2e.md`](../decisions/0003-behaviour-mapped-with-e2e.md).

## What this template intentionally omits

No router, store, data layer, or backend — they are stack choices, not agentic
principles. When you add them, give each its own boundary (e.g. `src/shared/api`)
with a public surface, and record the choice as an ADR in `../decisions/`.

## How to extend

Adding a feature is a mechanical, repeatable act:

1. `mkdir src/features/<feature-name>` (kebab-case).
2. Copy the three templates from [`../templates/`](../templates) and fill them in.
3. Specify the behaviour in `e2e/app.spec.ts`.
4. Run `pnpm api:report` and commit the new `etc/<role>-<name>.api.md`. The
   role diagram stays the same, because the new folder joins an existing role.
   A new page follows the same steps under `src/routes/<route-name>/`.
5. `pnpm verify` must pass before you call it done.
