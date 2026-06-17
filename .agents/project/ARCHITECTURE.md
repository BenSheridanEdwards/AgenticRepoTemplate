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
```

Reference implementation: [`src/features/threshold-counter/`](../../src/features/threshold-counter).

## The rules (and why)

1. **Features are islands.** A feature may not import from another feature's
   internals — only from its `index.ts`. This keeps coupling visible and lets
   Fallow flag boundary violations as architecture drift. If two features need
   to share, the shared thing moves up to a `src/shared/` module with its own
   public surface.

2. **Logic is pure and lives apart from React.** Business rules are plain
   functions (`statusForCount`), unit-testable without rendering. Hooks
   (`useThresholdCounter`) only *wire* that logic to component state. Components
   only *render*. This three-way split is why a feature can be fully tested at
   the unit level and is cheap for an agent to reason about.

3. **The public surface is `index.ts`.** Everything else in a feature folder is
   private by convention. Adding an export to `index.ts` is a deliberate act.

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
4. `pnpm verify` must pass before you call it done.
