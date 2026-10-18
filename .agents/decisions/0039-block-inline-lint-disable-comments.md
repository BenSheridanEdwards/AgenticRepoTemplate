# 39. Block inline lint-disable comments

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Amends:** [0015](0015-eslint-policy-stack-wiring.md), replacing its
  `reportUnusedDisableDirectives` line
- **Follows:** [0033](0033-result-diagrams-and-structure-validation.md), which
  left `noInlineConfig` for a separate change

## Context

ESLint honoured inline config in every file. A `// eslint-disable-next-line
<rule> -- <reason>` comment passed `pnpm lint:policy`, and
`scripts/check-suppressions.mjs` only asked that it name a rule and a reason.
The structure validator of [0033](0033-result-diagrams-and-structure-validation.md)
already fails any suppression under a result root, so a showcase result could
hold none. The reference packages, tooling, scripts and tests could.

ESLint also linted only package `src/` TypeScript plus its default
JavaScript globs. A test, an e2e spec, a `tooling/**/*.ts` file or a root
TypeScript config was never read by ESLint, so ESLint could not report a
comment in it.

## Decision

**ESLint ignores inline config.** `eslint.config.js` sets
`linterOptions.noInlineConfig: true` for every linted file. ESLint then applies
no `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`,
`eslint-enable`, `/* eslint <rule>: off */` or `/* global */` comment, and
reports each one as a warning. `pnpm lint:policy` runs `eslint
--max-warnings=0 .`, and so do `pnpm verify`, `scripts/verify-gates.sh` and the
CI `quality` job through it, so each comment fails the run. The rule finding
the comment tried to silence is reported too.

A local policy rule could report the same comments as errors. It would repeat
what ESLint already reports, so the config uses ESLint's own option.

**ESLint reads every source file.** A config entry gives
`**/*.{ts,tsx,mts,cts}` the TypeScript parser and no rules. Every tracked
`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` file outside `vendor/`
is now linted for inline config. The policy, React hooks and React Doctor
rules still run on package `src/` only. This adds about 0.3 s to a warm
`eslint .` on this box (2.4 s before, 2.7 s after, three interleaved runs).

**`reportUnusedDisableDirectives` goes.** With inline config ignored, ESLint
reads no disable directive, so no directive can be unused. The warning above
covers an unused directive too.

**ESLint owns its own directives.** `scripts/check-suppressions.mjs` stops
reading ESLint directives and keeps the TypeScript ones: `@ts-ignore` and
`@ts-nocheck` fail, and `@ts-expect-error` needs a reason. Its old message
advised writing a named, reasoned `eslint-disable-next-line`, which now fails.
ESLint reads a superset of the files the script reads, so no file loses
coverage.

**An exception goes in config.** An ESLint exception is a `files` entry or a
rule setting in `eslint.config.js` with a comment naming its reason, as the
React Doctor single-owner overrides already are. Main held no inline ESLint
config comment at this change, so nothing moved.

**Biome is unchanged.** The repo's rule outside a result is that a suppression
carries its reason, and Biome already refuses a `biome-ignore` without one.
This change is about ESLint comments only, so `biome-ignore` and
`@ts-expect-error` keep their current rules.

## Consequences

- An agent that meets an ESLint finding fixes the code, or proposes a config
  exception in a reviewed diff of a guarded file.
- `scripts/eslint-policy.test.ts` seeds each comment form in package source, a
  unit test, an e2e spec, a showcase result, tooling, scripts and a root
  config, and asserts ESLint fails on each line. It asserts that a named,
  reasoned disable leaves its finding reported, and that `eslint .` lints every
  tracked source file. Each of these tests fails on the previous config.
- The structure validator keeps its own ban on every suppression under a
  result root, including `biome-ignore` and `@ts-expect-error`.
- An editor shows each inline config comment as a warning, and the gate fails
  on it.
