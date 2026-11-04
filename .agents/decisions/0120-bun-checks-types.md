# 120. Bun checks types

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-04
- **Amends:** [0105](0105-typescript-7-is-the-only-typechecker.md) for the
  `typecheck` command and [0073](0073-adopt-the-typescript-toolchain-standard.md)
  for the typechecker

## Context

`pnpm typecheck` runs in pre-commit, `pnpm verify` and the CI quality job. It
ran TypeScript 7.0.2 three times: `tsc -b --force tsconfig.json`, then
`tsconfig.node.json` and `tsconfig.domain.json` with `--noEmit`.

Bun 1.4.4 ships `bun check`, a type checker that reports the same diagnostics
as `tsc`, follows project references like `tsc -b` and emits nothing. On
4 November 2026, on one Apple M2 Max with one warm-up and five runs, the three
`tsc` commands took a median 0.52 s and the three `bun check` commands 0.19 s.
Planted errors in the web, api, node and domain programs, and an api output
change that breaks its web callers, gave the same codes at the same lines and
columns from both. The maintainer approved the switch on that evidence.

`bun lint` and `bun fmt` exist only in Bun canary. Biome and Oxlint keep their
concerns.

## Decision

- Add `bun` at exactly 1.4.4 as a root dev dependency. Set `bun: false` in
  `allowBuilds`: its postinstall only replaces a placeholder `bin` with the
  real binary, and CI installs with `--ignore-scripts`.
- Run the binary from Bun's per-platform package (`@oven/bun-<os>-<arch>`,
  then its `-musl` build) through `scripts/bun.mjs`, which pnpm installs beside
  `bun` after either install. `node scripts/bun.mjs <args>` passes every
  argument through.
- `pnpm typecheck` runs `node scripts/typecheck.mjs`. It runs
  `bun check --no-script` over `-b tsconfig.json` (the web program and its api
  reference), `-p tsconfig.node.json` and `-p tsconfig.domain.json`, in order,
  and stops at the first failure. `--no-script` stops `bun check` from running
  the `check` script in `package.json`, which is Biome.
- Keep every tsconfig, program scope and strictness option unchanged. Hooks,
  `pnpm verify` and CI keep calling `pnpm typecheck`.
- The tests that prove what each program accepts or rejects run the same Bun
  binary: `tooling/architecture/typescript.test.ts` and the showcase type
  checks in `tooling/trial/inclusion.test.ts`.
- Keep the `@typescript/native` alias for `scripts/api-report.mjs`, which
  emits the declarations API Extractor reads; `bun check` emits none. Keep the
  TypeScript 5.9 library for the API consumers ADR 0105 lists.

## Consequences

The type check step is faster and holds the same diagnostics. Messages can
differ in wording: for a missing Node type, Bun suggests `bun add -d
@types/node` where `tsc` suggests npm. Bun exits 1 on any type error, where
`tsc -b` exits 2.

Upgrade `bun` like any other exact dev dependency, under the seven-day
release age. A machine with no matching per-platform package fails
`pnpm typecheck` with the paths it looked for.

`scripts/typecheck.test.ts` proves the pinned version runs without its
postinstall script, the platform package names, rejection of a seeded type
error and the fifteen-second check budget.

Revert the dependency, the two scripts, the `allowBuilds` line and the test
changes together to restore TypeScript 7 typechecking.
