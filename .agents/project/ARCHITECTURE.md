# Architecture

> This is the anchor for **showcase #2**: agent-written code must follow the
> patterns described here. When asked to verify or review work, an agent checks
> the change against this document first.

## The shape

This codebase is organised by **feature**, not by technical layer. A feature is
a self-contained vertical slice that owns its UI, its state, and its logic.

```
src/
├── main.tsx                 # composition root — the only place that wires the app to the DOM
├── App.tsx                  # top-level layout; composes features, holds no business logic
└── features/
    └── <feature-name>/      # one folder per feature, kebab-case
        ├── <Feature>.tsx          # presentational component (the "view")
        ├── use<Feature>.ts        # state wiring (the React hook)
        ├── <Feature>.test.tsx     # behaviour test, co-located
        └── index.ts               # the feature's PUBLIC surface — the only thing others import
└── shared/
    └── <module-name>/       # cross-feature code, one folder per module
        └── index.ts               # the module's PUBLIC surface
```

Reference implementation: [`src/features/threshold-counter/`](../../src/features/threshold-counter).

## Roles

[`.fallowrc.jsonc`](../../.fallowrc.jsonc) is the one rules file. Each role is a
Fallow zone, and Fallow fails the build on any import the table does not allow.

| Role | Folder | May import | Fallow zone |
| --- | --- | --- | --- |
| app | `src/main.tsx`, `src/App.tsx`, `src/index.css` | features, shared | `app` |
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
  (each feature and shared `index.ts`) under [`etc/`](../../etc). Commit the
  result; `pnpm api:check` fails when a report differs from the code, so every
  export change shows up as a reviewed diff.

## The rules (and why)

1. **Features are islands.** A feature imports only its own files and
   `src/shared/`. Fallow fails any import from one feature into another, or
   from a feature into the app zone. If two features need to share, the shared
   thing moves up to a `src/shared/` module with its own public surface.

2. **Logic is pure and lives apart from React.** Business rules are plain
   functions (`statusForCount`), unit-testable without rendering. Hooks
   (`useThresholdCounter`) only *wire* that logic to component state. Components
   only *render*. This three-way split is why a feature can be fully tested at
   the unit level and is cheap for an agent to reason about.

3. **The public surface is `index.ts`.** Everything else in a feature folder is
   private by convention. Adding an export to `index.ts` is a deliberate act,
   and its API report in `etc/` shows the change for review.

4. **`App.tsx` and `main.tsx` carry no business logic.** They compose. If you
   are tempted to put a condition or a calculation there, it belongs in a
   feature.

5. **Behaviour is defined by the E2E map, not by the implementation.** What the
   product *does* is the contract in `e2e/app.spec.ts`. Implementation may be
   refactored freely as long as the behaviour map stays green — see
   [`../decisions/0003-behaviour-mapped-with-e2e.md`](../decisions/0003-behaviour-mapped-with-e2e.md).

## What this template intentionally omits

No router, store, data layer, or backend — they are stack choices, not agentic
principles. When you add them, give each its own boundary (e.g. `src/shared/api`)
with a public surface, and record the choice as an ADR in `../decisions/`.

## How to extend

Adding a feature is a mechanical, repeatable act:

1. `mkdir src/features/<feature-name>` (kebab-case).
2. Copy the four templates from [`../templates/`](../templates) and fill them in.
3. Specify the behaviour in `e2e/app.spec.ts`; add a StyleProof surface if the
   feature introduces a new visual state.
4. Run `pnpm api:report` and commit the new `etc/<role>-<name>.api.md`. The
   role diagram stays the same, because the new folder joins an existing role.
5. `pnpm verify` must pass before you call it done.
