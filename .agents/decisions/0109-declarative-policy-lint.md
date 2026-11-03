# 109. Declarative policy lint

- **Status:** Accepted
- **Date:** 2026-11-03
- **Amends:** [Every lint rule is an error or removed](0079-no-advisory-lint.md) and [Oxlint replaces ESLint](0098-oxlint-replaces-eslint.md)

## Context

Ben asked lint to ensure declarative code. Native declarative lint covers
branch shape and collection idioms; policy selectors cover the remaining syntax.

## Decision

Enable `policy/no-let`, `policy/no-mutation`, `policy/no-classes` and
`policy/no-switch` at error only in the existing result-root override:
`{apps,packages}/*/src/**/*.{ts,tsx}` and `showcase/*/*/src/**/*.{ts,tsx}`.
Keep scripts and tooling outside these rules.

Reject every `let` declaration. Reject member assignments except `.current`,
`delete`, dotted push, pop, shift, unshift, splice, sort, reverse, fill and
copyWithin calls, and Object.assign unless its first argument is an object literal.
Use the physical filename when available. Exempt test/spec TypeScript files and
`features/<slice>/integrations.ts` or its integrations directory from mutation
checks: tests arrange mutable fixtures and integrations own external state.
Keep collection set/add/delete/clear calls outside the selectors; review judges
these and computed method calls. Ref writes remain subject to React's checks.

Reject classes without a superclass, class expressions without a superclass,
and `this`. Framework subclasses such as Error and Schema.TaggedErrorClass
remain available without `this`. Reject switch; use typed lookup objects or
Effect Match. Keep Effect.forEach and for await legal.

Keep the React Doctor rule names, count and digest unchanged. Its local adapter
leaves dotted calls in ordinary source to policy/no-mutation and retains Doctor
reporting for computed calls and mutation-exempt files. This preserves existing
coverage while avoiding duplicate reports between these two rules.
Native sort/reverse and parameter checks retain their coverage and diagnostics.

Skip unicorn/no-array-reduce because it contradicts North Star section 9.
Keep point-free callbacks and immutable map spreads legal. Leave style-only,
type-aware and every-file collection additions outside this change; they require
separate decisions. Keep Biome's existing ownership and all severity thresholds.

## Consequences

Failing and passing fixtures prove the selectors, scopes and exemptions.
The greeting state uses a pure function with early returns; tests capture their
resolvers in const holders. This improves correctness and consistency of generated
apps, adds no package and claims no runtime saving.
