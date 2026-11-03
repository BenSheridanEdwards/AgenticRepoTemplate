# 103. ESLint is retired; Oxlint is the only policy lint engine

- **Status:** Proposed
- **Date:** 2026-11-01
- **Replaces:** ADR 0015 (deleted), whose React Doctor CLI split now lives in
  [0102](0102-react-doctor-rules-run-as-an-oxlint-plugin.md), and, with
  [0084](0084-reject-every-inline-suppression.md),
  ADR 0039 (deleted)

## Context

The frozen rule set in `scripts/oxlint-rule-set.test.ts` proved Oxlint covers
the former policy lint gate before retiring ESLint. It pins rule names,
options, scopes, plugin settings and the count and digest of 349 React Doctor
rules. Its temporary ESLint cross-check passed on main before removal.

## Decision

Remove the four direct packages `eslint`, `eslint-plugin-react-doctor`,
`eslint-plugin-react-hooks` and `typescript-eslint`. Keep `eslint@10.12.0`
only as the required transitive peer of react-doctor's
`eslint-plugin-react-hooks@7.1.1`; the repository never runs ESLint.
Run `lint:policy` with Oxlint alone and `--deny-warnings`.

Rename the unchanged repository plugin to `tooling/oxlint-plugin-policy.js`
and guard its new path. The policy config remains `oxlint.config.ts`.
The following checks keep their names, options and scope under Oxlint:

- Core parameter reassignment, nesting depth and restricted imports.
- Repository component, comment, primitive, hook placement, handler, callback,
  page, filename, folder, test placement, slice isolation and schema rules.
- Loop and handwritten-glob selectors, now `policy/no-loops` and
  `policy/no-hand-written-globs`.
- Fourteen React hooks and Compiler rules under `react/*`, with
  `react/void-use-memo` also enabled.
- All 349 React Doctor rules with `portedRuleMode: curated`.

Record the approved drops:

- `react-hooks/config` and `react-hooks/gating`: QK2 (a) accepts their removal
  because the app uses neither Compiler options nor gating.
- `/* exported */`: QK3 (a) accepts removing its ESLint-specific meaning.
- `/* eslint-env */`: QK3 (a) accepts removing its environment meaning;
  `pnpm check:suppressions` still rejects the comment.

Replace `noInlineConfig` with `respectEslintDisableDirectives: false` and
`pnpm check:suppressions`, as recorded in ADR 0084. Oxlint ignores ESLint
disable directives and the suppression gate rejects inline directives.
typescript-eslint provided parsing only; no type-aware rule is lost.
Oxlint uses native parsing. Ignore patterns remain in the Oxlint config.

Keep the per-rule usage logger from ADR 0100 unchanged. It already runs
Oxlint through `.oxlintrc.json` and Biome and never ran ESLint. It does not
include the `oxlint.config.ts` policy rules: pre-commit does not run
`lint:policy`, so recording those failures would describe a gate that commit
never enforced. A second Oxlint pass with the React Doctor JS plugin would
also add seconds to each commit attempt, against ADR 0062's budget.
Revisit logging policy rules when moving `lint:policy` into pre-commit.

## Consequences

ADRs 0050 and 0079 retain their rules, now enforced by Oxlint. ADR 0046's
slice-isolation check belongs to Oxlint and its runtime proof lives in
`scripts/oxlint-policy.test.ts`. ADR 0073's remaining ESLint checks are now
Oxlint checks. The frozen rule set stays as the regression proof after its
ESLint cross-check leaves. Hooks, CI entry points and the React Doctor CLI
remain unchanged. Reverting this retirement restores the prior engine and
direct packages together.
