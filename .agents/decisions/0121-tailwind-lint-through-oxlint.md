# 121. Tailwind lint through Oxlint

- **Status:** Proposed
- **Date:** 2026-11-04
- **Amends:** [0114](0114-tailwind-on-the-ui-design-tokens.md), closing its unknown-class gap

## Context

The maintainer requested a fuller Tailwind lint set without restoring ESLint or adding a second formatter. Tailwind v4 silently drops off-theme utilities after the colour, radius and font resets. The two primitives also join default and caller classes without resolving conflicting utilities.

## Decision

Pin `eslint-plugin-better-tailwindcss` 4.10.0 as an Oxlint JS plugin. Its `entryPoint` is the absolute path to `packages/ui/src/styles.css`; `cwd` resolves Tailwind from `apps/web`. This reads the real v4 design system, including resets and custom variants. Enable the seven rules below at error in production web, showcase web and UI TypeScript. Tests keep their sentinel classes. Keep `--deny-warnings`, Biome formatting, existing hooks and existing CI jobs.

Use `cn` from `@repo/ui` to compose complete strings. Its only dependency, `tailwind-merge` 3.7.0, resolves default/caller conflicts across arguments, which the lint plugin cannot see. Class constants also use `cn('...')`: the plugin checks calls but does not follow arbitrarily named identifiers. Extend the existing `policy/no-arbitrary-styles` to reject raw class constants, string addition, interpolation and other class-building calls, while retaining its arbitrary-value and inline-style checks. Allow `@apply` only in the UI theme file through the existing `lint:styles` script.

### Rule decisions and measured costs

Times are seconds of wall time for a fresh lint process on the real tree, median of three runs. Each isolated plugin row enables only that rule in a minimal config over the tracked production web/UI sources, including plugin loading and CSS compilation. Custom policy costs use the full batch. Shared startup makes these costs non-additive; CI measures the combined batch in its existing quality step. The machine was an arm64 Mac14,13, 12 logical CPUs, 96 GiB RAM, Node 26.12.1, pnpm 11.3.0. Concurrent sessions make sub-second differences noisy.

| Rule | Prevents | Tool | Local / shared CI batch cost; false positives | Upkeep/version risk | Adopted and why |
| --- | --- | --- | --- | --- | --- |
| Deterministic order | Unstable class diffs | `enforce-consistent-class-order` | 0.974s / 3s; no production findings | Tailwind ordering changes with compiler versions | Yes; `pnpm lint:policy --fix` fixes order and CI checks it |
| Unknown/off-theme classes | Silently missing CSS, such as `bg-red-500`, `text-white`, `font-mono`, `rounded-sm` | `no-unknown-classes` | 1.005s / 3s; test sentinel `wide` was flagged in the unscoped probe | CSS compiler and entry-point coupling; fixtures pin token resets | Yes; closes ADR 0114's gap without a second class catalogue |
| Arbitrary values/properties/variants | Escaping the token system | Existing `policy/no-arbitrary-styles` | Shared batch 1.617s / 3s; no new production findings | Small syntax check, with bracket and parenthesis fixtures | Yes; retains the existing stricter policy |
| Conflicts | `p-2 p-4` assigning the same properties | `no-conflicting-classes` | 0.978s / 3s; no production findings | Compiler CSS properties; test distinct variants too | Yes; fail ambiguous lists before runtime |
| Duplicates | Repeated `p-4 p-4` | `no-duplicate-classes` | 0.873s / 3s; no production findings | Low; token splitting | Yes; cheap within the same plugin |
| Deprecated v4 utilities | Old names such as `flex-shrink-0` | `no-deprecated-classes` | 0.994s / 3s; no production findings | Upstream rename catalogue follows Tailwind | Yes; review fixes for meaning, especially renamed scales |
| Shorthands | Redundant `w-4 h-4` instead of `size-4` | `enforce-shorthand-classes` | 0.978s / 3s; no production findings; overlapping fixes can require another pass and leave double spaces | Upstream shorthand catalogue; avoid combining canonical-class rule | Yes; catches redundancy with no tree rewrite |
| Complete class construction | `bg-` plus a variable missing Tailwind extraction | `no-concatenated-classes` | 0.862s / 3s; no production findings | AST matching | Yes; catches partial names inside supported helpers |
| One merging helper | Joined defaults winning unpredictably against caller classes | Policy plus `cn`/`tailwind-merge` | Shared batch 1.617s / 3s; two joins migrated; unit test proves caller override | Runtime Tailwind merge groups; test custom tokens | Yes; resolves conflicts across arguments that lint misses |
| Inline style props | Token bypass | Existing policy rule | Shared batch 1.617s / 3s; no production findings | Low; JSX attribute check | Yes; retain existing enforcement |
| `@apply` placement | Styling spreading across package CSS | Existing `lint:styles` | Whole script 0.749s before, 1.072s after (1.072/1.202/1.036s); CI under 1s both; no production findings | Small directive check | Yes; one central CSS owner |
| Prettier sorting | Same order concern | `prettier-plugin-tailwindcss` | Rejected before installation; no added gate cost | Adds Prettier 3 and another formatter | No; v4 `tailwindStylesheet` works, but duplicates Biome formatting ownership |
| Biome sorting | Same order concern | Biome 2.5.1 `useSortedClasses` | Rejected before activation; no added gate cost | Pinned schema exposes no v4 stylesheet setting; 2.6 changes rule/config | No; defer the upgrade and keep all Tailwind lint with Oxlint |
| Generic class flattening | Nested object/array class input | `clsx` | Rejected before installation; no added runtime cost | Another input API and dependency | No; current callers need strings and conditional false/null/undefined only |

Before: `lint:policy` 2.390/1.303/1.322s, `lint:styles` 0.767/0.749/0.743s, Biome `check` 2.268/0.996/0.931s. After the complete set: `lint:policy` 1.555/1.617/1.796s, median 1.617s, +0.295s against the before median. Biome after: 1.139/1.003/1.019s. Hosted quality-step timestamps measure `lint:policy` at 2s before ([parent run](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/actions/runs/41799989627)) and 3s after ([implementation run](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/actions/runs/41849404447)); `lint:styles` stays below 1s at whole-second resolution. Each TypeScript rule shares that one 3s CI batch; this is not a per-rule incremental attribution. The PR repeats these timings. Measured staged pre-commit steps: typecheck 2.444s, Biome 1.484s, anti-slop 3.788s, Fallow 5.585s and gitleaks 1.830s. All passed. The pre-commit command set stays unchanged, with its 30-second per-step budget.

## Alternatives and evidence

- [Plugin rules and Oxlint setup](https://github.com/schoero/eslint-plugin-better-tailwindcss/tree/v4.10.0): actual Oxlint fixtures verify each selected rule and CSS entry-point resolution outside the repo working directory.
- [Oxlint JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins): supports ESLint-compatible plugins; ESLint itself stays retired.
- [Biome 2.6 release](https://biomejs.dev/blog/biome-v2-6/): introduces v4-aware stylesheet configuration; the installed 2.5.1 schema has only attributes/functions for `useSortedClasses`.
- [Prettier Tailwind plugin](https://github.com/tailwindlabs/prettier-plugin-tailwindcss): supports v4 CSS entry points but requires Prettier.

## Consequences

`pnpm lint:policy`, `pnpm verify` and the current quality lane own the expanded set. The runtime class strings retain their utilities and variants; the Visual regression job uses the existing baselines. Class-order autofix and Biome reach a fixed point in the regression fixture. Run additional fix passes when fixes overlap, then inspect the result. Review semantic utility replacements manually.

The plugin parses TypeScript/JSX through Oxlint. HTML retains ADR 0114's style, arbitrary-value and colour checks; CSS retains the central-theme policy. Imported computed class values and runtime strings remain outside static class validation. Keep reusable class constants in `cn` calls so they are checked at their definition. Upgrades must rerun the real-theme and autofix fixtures. Revert this ADR's implementation together to remove the plugin and helper.
