# 79. Every lint rule is an error or removed

- **Status:** Proposed
- **Date:** 2026-10-29
- **Supersedes:** [0063](0063-advisory-declarative-style-lint.md)
- **Amends:** [0070](0070-vendored-anti-slop-oxlint-rules.md) for the advisory split and
  [0046](0046-fail-lint-on-warnings.md) for Fallow warnings

## Context

Ben decided on 29 October: "We don't want advice, all warnings become errors
if it forces the code into the shape we want". Advisory findings leave agents
with standards that the gates do not enforce. Layout and naming word bans
also create noise without improving the contracts.

## Decision

Set each lint rule to `error` or remove it. Keep one tool owner per concern.
Resolve the Oxlint advisory rules as follows.

| Rule | Findings at c128c05 | Call | Why |
|---|---|---|---|
| `require-safety-comment-for-type-assertion` | 41 | error | AGENTS.md "Before you push" step 3 already requires it |
| `no-known-value-widening` | 11 | error | keeps type evidence (`satisfies`, inference) |
| `no-unsafe-dictionary-type` | 8 | error | concrete value contracts (ADR 0011) |
| `no-unknown-parameters` | 4 | error | parse at the boundary (ADR 0011) |
| `no-object-parameters` | 1 | error | same |
| `no-chained-type-assertions` | 1 | error | same |
| `no-conditional-empty-object-spread` | 1 | error | explicit object building |
| `no-unknown-returns` | 1 | error | same as unknown parameters |
| `require-readable-spacing` | 1,714 | delete | whitespace only; Biome owns layout (TECH_STACK, ADR 0073) |
| `no-shape-in-symbol-names` | 51 | delete | word ban in names; changes no code shape |
| `no-array-filter-map` | 22 | delete | contradicts North Star §9 and golden rule 8, which name `filter` and `map` |
| `no-runtime-typeof` outside package source | 47 | delete the widening | in untyped `.mjs` tooling `typeof` is the boundary parse; the `error` override for `apps/*/src/**`, `packages/*/src/**`, `showcase/*/*/src/**` stays |

Move the declarative rules into their owning gate after fixing their findings:

| Owner | Rule | Call |
|---|---|---|
| ESLint `eslint.config.js` | Loop selectors in `no-restricted-syntax` | error |
| ESLint `eslint.config.js` | `no-param-reassign` with `props: true` | error |
| Biome | `suspicious/noVar` | error |
| Biome | `style/noIncrementDecrement` | error |
| Biome | `style/noNonNullAssertion` | warn to error |
| Fallow | Rules at default warn | error |
| Fallow | Rules for frameworks this repo lacks | off |

Plan items I11a through I11h implement this decision. I11a settles Oxlint and
records the full decision. I11b through I11g clear parameter reassignment and
loops, then enforce those rules. I11h removes the advisory commands and config,
promotes the Biome rules, and sets Fallow severities explicitly.

## Consequences

Agents fix findings before passing a gate. No lint command only warns.
Biome owns whitespace; declarative `filter` and `map` remain available.
The package-source `typeof` restriction stays in force. The vendored rules,
ignore lists and dependency versions stay unchanged in I11a.
