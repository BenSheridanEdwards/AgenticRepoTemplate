# 108. Native declarative lint

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

The maintainer asked lint to ensure declarative code. Native rules in pinned Oxlint cover
common branching and collection patterns without another package or plugin code.

## Decision

Enable `unicorn` beside `react`, with every added rule at error.
Run `no-else-return` with `allowElseIf: false` in every file.
In `{apps,packages}/*/src/**/*.{ts,tsx}` and `showcase/*/*/src/**/*.{ts,tsx}`,
enable `no-lonely-if`, `no-nested-ternary`, `unicorn/no-array-for-each`,
`unicorn/no-array-sort`, `unicorn/no-array-reverse`, `unicorn/prefer-array-find`,
`unicorn/prefer-array-some`, `unicorn/prefer-array-flat` and
`unicorn/prefer-object-from-entries`.
Add a second override for those roots with `no-restricted-globals` banning
`document` and `window`, excluding only `{apps,showcase/*}/web/src/main.tsx`.
The composition root needs browser access to mount React. Tests receive these
native rules too; imported `Effect.forEach` is an effect combinator, not array iteration.
Keep scripts and tooling outside the collection rules so side-effect iteration
remains available there while loops stay banned.

Skip `unicorn/no-array-reduce`, which contradicts North Star section 9 and
steers toward loops. Skip callback-reference and map-spread restrictions because
point-free callbacks and immutable spread remain useful declarative transforms.
Keep style-only and type-aware additions outside this change. Keep Biome-owned
rules with Biome. Keep promise callbacks where tRPC requires them and lazy
state initialization where React supports it. General reassignment, mutation,
classes and switch remain review duties until their own policy rules land
(now ADR 0109).

## Consequences

The frozen rule snapshot and failing/passing fixtures prove scopes and the browser
exemption. Preserve the React Doctor count and digest. Fix the two redundant else
branches in the PR validator without changing its output. This improves generated
app consistency; it claims no runtime saving and adds no dependency.
