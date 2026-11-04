# 105. TypeScript 7 is the only typechecker

- **Status:** Accepted (merged in #287); amended by
  [0120](0120-bun-checks-types.md) (Bun runs `pnpm typecheck`)
- **Date:** 2026-11-02

## Context

The TypeScript toolchain standard calls for TypeScript 7 typechecking by path.
The existing `typecheck` script still uses TypeScript 5.9.3. TypeScript 7
ships no compiler API, so replacing the library would break tools that load it.

## Decision

Add the exact alias `"@typescript/native": "npm:typescript@7.0.2"` and resolve
it in the root lockfile importer, independently of Fallow's optional dependency.
Run `node node_modules/@typescript/native/bin/tsc` for every `typecheck` command.
Keep `--force`, all four program scopes and every strictness option unchanged.
Hooks and CI continue calling `pnpm typecheck`.

Keep the existing `typescript` manifest range and its locked 5.9.3 library:

- Jest loads `jest.config.ts` through ts-node. Remove this use when Jest retires.
- Commitlint loads `commitlint.config.ts` through cosmiconfig-typescript-loader.
  Remove this use when its loader supports the new API or its config stops
  requiring that loader.
- React Doctor requires the TypeScript API with `>=5.0.4 <6`. Remove this use
  when React Doctor supports the new API or no longer needs it.
- API Extractor also loads the compiler API. Keep its supported library until
  its API report generation supports a replacement.

Remove the 5.9 library only after every remaining API consumer can run without
it. Neither TypeScript package belongs in `allowBuilds`.

## Consequences

Typecheck uses one pinned compiler while API consumers retain their library.
Tests prove the version, lockfile importer, rejection of a seeded type error,
acceptance of valid code and the repository's fifteen-second check budget.
The generated-workspace benchmark compares cold, warm and one-change runs.
Revert the alias, lockfile entry and script together to restore the old compiler.
