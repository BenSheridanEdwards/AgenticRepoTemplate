# 50. Enforce applicable anti-slop policies in ESLint

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-22
- **Builds on:** [0019](0019-local-eslint-policy-plugin.md),
  [0015](0015-eslint-policy-stack-wiring.md)

- **Superseded in part by:** [ADR 0073](0073-adopt-the-typescript-toolchain-standard.md)
  for Biome lint ownership; implementation follows in separate PRs.

## Context

Sarah Fim's [video](https://x.com/sarahfim/status/2108298553823203613)
and [write-up](https://x.com/sarahfim/status/2109736893198016898) describe an
anti-slop factory where lint refuses common agent mistakes. Issue #114 audits
those policies against this scaffold. NORTH_STAR's done criteria require a
seeded failure, a passing tree, bypass coverage and guidance naming the gate.

## Decision

`pnpm lint:policy` applies these policies to every result's package sources,
including tests, through the existing ESLint source globs:

| Policy | Decision and owner |
| --- | --- |
| Large comments | Add `policy/no-large-comments`: at most four physical lines, including delimiters. Adjacent comments separated only by whitespace on consecutive lines count together, including mixed block, JSDoc and line comments and a trailing comment continued on the next line. A blank line or executable code starts a new comment group. |
| Deep nesting | Add ESLint core `max-depth` at four. Functions start their own depth, as the core rule defines. Fallow continues to own statistical complexity; Biome has no nesting policy enabled. |
| Global controls | Add `policy/use-ui-primitives`: use `@repo/ui` Button and TextField instead of native button and input elements outside the UI package and test harnesses. Cover JSX and React createElement, including named import aliases and namespace/default imports. Checkbox and radio inputs remain native until dedicated primitives exist. A spread after their type removes that exemption because it can override the type. |
| Raw clients | Retain Fallow `contract/effects-in-integrations`, `io-effects-in-integrations`, `node-io-in-integrations` and `trpc-client-in-api-client`: IO belongs in integration boundaries and the web tRPC wrapper. The boundary is the permitted client wrapper; an additional blanket fetch ban would contradict that contract. |
| Stripe and Prisma clients | Add when those dependencies arrive; neither is installed. |
| Hardcoded Tailwind colours and theme tokens | Add when a theme contract exists. This scaffold uses plain CSS, has no Tailwind and defines no semantic theme-variable contract to enforce. |
| Errors in an errors file | Add when custom error classes and an errors role exist. Today errors are built-in Error or TRPCError at the existing boundaries; a new role solely for these would change the architecture without a target. |
| Other anti-pattern projects | Keep Biome general lint, React hooks/Compiler and React Doctor policies, and Fallow dead-code, complexity and architecture gates as the existing owners. Add no overlapping lint project or dependency. |

Sarah's comment threshold is three lines. This repository deliberately uses
four: `apps/web/src/api-client/trpc.ts` has a four-line explanation of declaration
emit and naming constraints, copied into the recorded trial scaffolds. Keeping
that necessary explanation and the trial evidence unchanged is preferable to
rewriting historical results solely to shorten a comment. A fifth line fails;
there are no per-file comment exceptions.

The rules reuse the existing plugin, parser and gate wiring. Inline directives
remain refused by `noInlineConfig` and `--max-warnings=0` (ADR 0039). Config and
plugin edits wait for the enforcement sign-off on the current head (ADR 0024).
The policies are syntax checks, following the existing plugin: computed runtime
element tags or arbitrary function indirection are outside their static model.

## Proof and consequences

`scripts/eslint-policy.test.ts` drives the real CLI with violations and passing
thresholds. It covers every result/package shape, contiguous comment syntaxes,
native control replacements, aliased createElement calls, spread overrides,
primitive definitions and test harnesses. Existing inline-config tests prove a
source comment cannot turn these policies off. `pnpm verify` and `pnpm e2e`
remain the local completion gates and CI reruns the policies on clean checkouts.

No dependency, tool owner, UI behaviour or trial evidence changes.
