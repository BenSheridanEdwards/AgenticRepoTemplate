# 41. Scripts ask the tool which files a glob covers

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Builds on:** [0019](0019-local-eslint-policy-plugin.md), [0030](0030-docs-name-only-guarded-paths-for-sign-off.md)

## Context

Gate and tooling scripts decide which files a tool's glob covers. Several of
them did this with a hand-written glob translator, and each copy drifted from
the tool it imitated. Review found the drift each time, after the code was
written:

- `bcc8b088` (#88) fixed `scripts/check-sign-off-docs.mjs`, whose `**/` needed
  at least one folder.
- `f81291f6` and `2308455e` (#89) replaced hand matching in `check:adr`,
  `lighthouse-scope` and `jest-scope`; `jest-scope` now asks Jest itself
  (`--listTests`).
- `ede69583` (#90) extended the Fallow zone translator, then in
  `scripts/fallow-roles.mjs`, with braces in place of calling a matcher. The
  review of #91 noted it as "a second glob dialect" and left it in place.
- `ee44b8d9` (#91) fixed `structure.mjs`, which read Playwright's `testMatch`
  differently from Playwright.

Two copies remain on main at `75c3203`:
`tooling/architecture/contract.mjs` (`globToRegExp`, which gives every file
its architecture role) and `scripts/check-sign-off-docs.mjs`
(`GLOB_WILDCARDS`). The contract copy reads `a/**/b.ts` as needing a folder
between `a` and `b.ts`, which `matchesGlob` does not. No zone has that
shape yet, so today's roles are right.

An agent copies the nearest example, so each copy invites the next one.

## Decision

- Both copies call `matchesGlob` from `node:path`, as
  `scripts/check-dependency-adr.mjs` and `scripts/jest-scope.test.ts` already
  do. On main, `matchesGlob` gives the same answer as each copy for every
  Fallow zone pattern and every glob-shaped code span in the tracked docs,
  over all 420 tracked files.
- `eslint.config.js` adds a block for `scripts/**/*.{js,mjs}` and
  `tooling/**/*.{js,mjs}` with core `no-restricted-syntax`. It fails on the
  string literals `'**'` and `'**/'`, which both translators held in every
  version. The error names `matchesGlob` and the tool's own file list
  (`fallow config`, `jest --listTests`).
- The rule fails on every bad version above: `bcc8b088^` and `bcc8b088`
  (`check-sign-off-docs.mjs`), `f4d9522`, `ede69583^` and `ede69583`
  (`fallow-roles.mjs`), and main's two copies. It passes on main once both
  copies call `matchesGlob`.

### Alternative considered

A `policy/no-hand-glob` rule in `tooling/eslint-plugin-policy.js` could also
look for a `RegExp` built from a pattern. The policy plugin's rules run on
package sources only, and the two literals already flag every copy in the
history, so the core rule is the smaller change.

## Consequences

- `matchesGlob` reads braces as alternatives and leaves dot folders out of
  `*` and `**` unless the pattern names them. The docs check now reads each
  path span the same way. No doc glob on main changes its covered files.
- The rule reads `.js` and `.mjs` files under `scripts/` and `tooling/`. The
  `.ts` files there come under lint when a later change gives them a parser.
- The rule reads literals, so a script that builds `'**'` another way passes;
  review still reads new matching code.
- Other hand copies of a tool's reading stay as they are and are named here
  for a later change: the YAML reader in `scripts/check-dependency-adr.mjs`,
  the `pnpm-lock.yaml` line reader in `tooling/trial/run-trial.mjs`, the
  coverage rounding in `tooling/coverage-by-result.mjs`, and the ESLint
  directive patterns in `tooling/architecture/structure.mjs` and
  `scripts/check-suppressions.mjs`.
- No dependency, workflow or hook changes.
