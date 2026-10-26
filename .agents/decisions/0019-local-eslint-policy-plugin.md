# 19. Repository policy rules live in a local ESLint plugin

- **Status:** Accepted
- **Date:** 2026-10-17

- **Superseded in part by:** [ADR 0073](0073-adopt-the-typescript-toolchain-standard.md)
  for Biome lint ownership; implementation follows in separate PRs.

## Context

[`CONVENTIONS.md`](../project/CONVENTIONS.md),
[ADR 0012](0012-local-state-inside-custom-hooks.md), and
[ADR 0013](0013-one-role-table-for-structure.md) state React rules in prose:
one component per file, state and effects only inside named `use*` hooks,
`handle` names for functions a component defines, `on` names for callback
props, pages under `src/routes/`, and kebab-case folders. Prose leaves each
rule to the reader. The installed plugins cover part of the set. React Doctor
ships `no-multi-comp` as a retired rule that reports nothing, and its
`jsx-handler-names` reads JSX attributes, so it would rename the functions a
hook returns.

## Decision

- [`tooling/eslint-plugin-policy.js`](../../tooling/eslint-plugin-policy.js)
  holds the repository's own policy rules as one local ESLint plugin, with no
  new dependency. [`eslint.config.js`](../../eslint.config.js) turns on every
  rule in it as an error for `src/**`.
- The rules are `one-component-per-file`, `state-and-effects-in-hooks`
  (`useState`, `useReducer`, `useActionState`, `useOptimistic`,
  `useSyncExternalStore`, and the effect hooks, including aliased and namespace
  calls),
  `handler-names`, `callback-prop-names`, `pages-in-routes`,
  `file-matches-export`, and `folder-names`.
- Existing plugins own the rest of the set: `react-doctor/prefer-function-component`
  for class components, core `no-restricted-imports` for imports past a public
  `index.ts`, and `react-hooks/set-state-in-effect` for state mirrored by an
  effect.
- Biome keeps general lint ([ADR 0010](0010-lint-engine-ownership.md)). It
  gains `useNamingConvention` and `useFilenamingConvention` for `src/**`, plus
  `useConsistentTypeDefinitions` and `noEmptyBlockStatements` for the whole
  repository.
- Fallow gains the `routes` zone from ADR 0013. The app zone imports routes,
  each route imports features and shared code, and one route never imports
  another.
- Suppression comments stay outside ESLint, because a blanket disable comment
  silences the rule that would report it. `scripts/check-suppressions.mjs`
  (`pnpm check:suppressions`) reads every tracked source file and fails an
  ESLint disable that names no rule or gives no reason, `@ts-ignore`,
  `@ts-nocheck`, and an undescribed `@ts-expect-error`.
- Render props (`render*`) and `children` keep their names under
  `callback-prop-names`. Test files are outside the component rules, so a test
  harness may hold state directly.
- Each rule's message names the fix. `scripts/eslint-policy.test.ts` proves
  each rule blocks a violating fixture through the real ESLint CLI.

## Consequences

- A new policy rule is a function in one file plus one test. It needs no
  package, so it needs no version bump.
- The rules read syntax and file paths only. They recognise a component as a
  module-scope PascalCase function in a `.tsx` file, the same heuristic the
  React hooks rules use.
- Changes to the plugin are enforcement changes under
  [ADR 0007](0007-protect-enforcement-paths-by-default.md), because `tooling/`
  is a protected path.
