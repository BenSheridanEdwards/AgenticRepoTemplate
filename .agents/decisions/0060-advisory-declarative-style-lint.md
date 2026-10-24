# 60. Advisory declarative-style lint, outside the gates

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-24
- **Follows:** [0010](0010-lint-engine-ownership.md),
  [0015](0015-eslint-policy-stack-wiring.md) and
  [0046](0046-fail-lint-on-warnings.md)

## Context

Ben wants a measure of how far the code is from a declarative style: loops
replaced by `map`/`filter`/`reduce` and friends, no parameter reassignment, no
`var`, no `++`/`--`, `const` by default, arrow callbacks, and array callbacks
that return. The rules start as warnings so the count is visible before any
code changes.

Every lint gate here fails on a warning. `pnpm lint:policy` runs
`eslint --max-warnings=0 .` ([0015](0015-eslint-policy-stack-wiring.md)), and
[0046](0046-fail-lint-on-warnings.md) says "**Biome fails on a warning.** Every
Biome lint/check gate invocation passes `--error-on-warnings`". A warn-level
rule added to `eslint.config.js` or `biome.json` would turn the gates red on
the existing code, which is a new error-level standard in effect, not an
advisory one.

## Decision

**A separate, advisory command.** `pnpm lint:declarative` runs two configs in
`tooling/declarative-lint/`, both at `warn`. It is not part of `pnpm verify`,
the git hooks or CI, and `eslint.config.js` and `biome.json` are unchanged, so
every gate holds exactly what it held before.

**One owner per rule** ([0010](0010-lint-engine-ownership.md)). Biome owns a
rule when Biome 2.5.1 has it; ESLint (parser only, no type-aware or stylistic
rules) owns the rest.

| Concern | Owner |
| --- | --- |
| `for`, `for...in`, `for...of` (not `for await`), `while`, `do...while` | ESLint `no-restricted-syntax`, one tagged message per statement |
| Parameter and parameter-property reassignment | ESLint `no-param-reassign` with `props: true`; Biome `style/noParameterAssign` has no property option |
| `var` | Biome `suspicious/noVar` |
| `++` and `--` | Biome `style/noIncrementDecrement` |
| `const` by default | Biome `style/useConst`, already `error` in `biome.json` and left there |
| Arrow callbacks | Biome `complexity/useArrowFunction`, already recommended and escalated by `--error-on-warnings` |
| Array callbacks return | Biome `suspicious/useIterableCallbackReturn`, already a recommended error |

The Biome config extends `biome.json` and the command passes `--only`, so it
reports these rules alone and keeps every existing severity. `noForEach` stays
off.

**Promotion.** Moving a rule into a gate is a later ADR, made once its count
reaches zero.
