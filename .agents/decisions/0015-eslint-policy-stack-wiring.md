# 15. ESLint policy stack wiring

- **Status:** Accepted
- **Date:** 2026-10-15
- **Superseded in part by:** [ADR 0073](0073-adopt-the-typescript-toolchain-standard.md)
  for Biome lint ownership; implementation follows in separate PRs.
- **Amended by:** [ADR 0082](0082-retire-gitnexus-graphify-verify-gates-and-architectplaybook-audits.md)

## Context

[0010](0010-lint-engine-ownership.md) gives Biome formatting and general lint,
gives ESLint policy rules, React hooks rules, and React Compiler rules, and runs
React Doctor rules through ESLint where the plugin has them, with the React
Doctor CLI covering the rest. This record sets out how that is wired and names
the owner of every rule that two engines both implement.

## Decision

**Packages.** `eslint` 10, `typescript-eslint` 8 (parser only),
`eslint-plugin-react-hooks` 7, `eslint-plugin-react-doctor` and `react-doctor`
pinned to 0.9.18. Their peer ranges all accept ESLint 10 and TypeScript 5.9.

**Config.** [`eslint.config.js`](../../eslint.config.js) is a flat ESM config
for `src/**/*.{ts,tsx}`. It starts from no base rule set and enables
`react-hooks` `flat.recommended`, which includes the React Compiler rules, and
`react-doctor` `recommended`. `reportUnusedDisableDirectives` is `error`.
`pnpm lint:policy` runs `eslint --max-warnings=0 .`, so warnings block too.
React Doctor's `react-compiler` capability stays undeclared because the build
does not run the React Compiler.

**One owner per rule.** The rules below are off in one engine, and the config
names the owner beside each one.

| Concern | Owner | Turned off |
| --- | --- | --- |
| Hooks call order | `react-hooks/rules-of-hooks` | Biome `correctness/useHookAtTopLevel`, `react-doctor/rules-of-hooks` |
| Effect dependencies | `react-hooks/exhaustive-deps` | Biome `correctness/useExhaustiveDependencies`, `react-doctor/exhaustive-deps` |
| setState during render | `react-hooks/set-state-in-render` | `react-doctor/no-set-state-in-render` |
| setState inside an effect | `react-hooks/set-state-in-effect` | `react-doctor/no-derived-state-effect` |
| Refs during render | `react-hooks/refs` | `react-doctor/no-ref-current-in-render` |
| Components created in render | `react-hooks/static-components` | `react-doctor/no-nested-component-definition`, `react-doctor/no-unstable-nested-components` |
| JSX accessibility | Biome `a11y/*` | `react-doctor/` `alt-text`, `anchor-ambiguous-text`, `anchor-has-content`, `anchor-is-valid`, `aria-activedescendant-has-tabindex`, `aria-props`, `aria-proptypes`, `aria-role`, `aria-unsupported-elements`, `autocomplete-valid`, `button-has-type`, `click-events-have-key-events`, `heading-has-content`, `html-has-lang`, `iframe-has-title`, `img-redundant-alt`, `interactive-supports-focus`, `label-has-associated-control`, `lang`, `media-has-caption`, `mouse-events-have-key-events`, `no-access-key`, `no-aria-hidden-on-focusable`, `no-autofocus`, `no-distracting-elements`, `no-interactive-element-to-noninteractive-role`, `no-noninteractive-element-to-interactive-role`, `no-noninteractive-tabindex`, `no-redundant-roles`, `no-static-element-interactions`, `prefer-tag-over-role`, `role-has-required-aria-props`, `role-supports-aria-props`, `scope`, `tabindex-no-positive` |
| JSX correctness | Biome `useJsxKeyInIterable`, `noRenderReturnValue`, `noVoidElementsWithChildren`, `noCommentText`, `noDuplicateJsxProps`, `noArrayIndexKey` | `react-doctor/` `jsx-key`, `no-render-return-value`, `void-dom-elements-no-children`, `jsx-no-comment-textnodes`, `jsx-no-duplicate-props`, `no-array-index-as-key` |
| Security and performance | Biome `noScriptUrl`, `noBlankTarget`, `noDangerouslySetInnerHtmlWithChildren`, `noGlobalEval`, `noAccumulatingSpread`, `noNonNullAssertion` | `react-doctor/` `jsx-no-script-url`, `jsx-no-target-blank`, `no-danger-with-children`, `no-eval`, `no-spread-accumulator-in-reduce`, `no-non-null-assertion-on-maybe-undefined-result` |

Seeded violations showed both engines reporting the same line for the hooks
pairs and most Biome pairs; the remaining pairs match by rule definition. `react-doctor/no-derived-state` stays on because it
also covers state copied during render, which the react-hooks rules allow.
`react-doctor/no-string-refs` and `react-doctor/no-unknown-property` stay on
because the matching Biome rules sit outside the recommended set.

**React Doctor split.** The ESLint plugin runs React Doctor's per-file rules.
In the 0.9.18 source, the `react-doctor` CLI adds checks the plugin cannot
express: cross-file
maintainability (`react-doctor/duplicate-jsx-subtree`), project checks
(reduced-motion CSS, React Server Components advisories, Expo and React
Native project checks), and a project security scan. `pnpm react-doctor` runs
`react-doctor . --no-lint --no-supply-chain --no-telemetry --blocking warning
--yes`:

- `--no-lint`: ESLint owns the per-file rules.
- `--no-supply-chain`: the supply-chain scan calls Socket.dev, and dependency
  risk belongs to `pnpm audit` and Dependabot.
- `--no-telemetry`: skips the score API, share URL, crash reports, and usage
  metrics, so the scan makes no network calls.
- `--blocking warning`: warnings fail the run, matching `--max-warnings=0`.

The scan passes with the network removed and reports identical diagnostics
on repeated runs.

**Where it runs.** `pnpm lint:policy` and `pnpm react-doctor` run in
`pnpm verify` right after `pnpm check`, in `scripts/verify-gates.sh` (removed in 2026-10; see ADR 0082), and as
steps in the CI `quality` job ("Type check · lint · format") after
`pnpm check`. `scripts/eslint-policy.test.ts` drives the real ESLint CLI to
prove hooks, React Compiler, and React Doctor findings block while general lint
stays with Biome.

## Consequences

- Every lint finding comes from one engine, and the config comment beside each
  disabled rule tells an agent which engine owns it.
- React Doctor rule updates arrive with a reviewed version bump, since both
  React Doctor packages are pinned to exact versions.
- `react-doctor` brings a newer `playwright-core`; a pnpm override keeps
  `@axe-core/playwright` on the version `@playwright/test` uses, and the two
  move together.
- Staged policy lint in pre-commit and full lint in pre-push land with the
  hooks-parity PR (plan PR 7), which mirrors these CI steps locally.
