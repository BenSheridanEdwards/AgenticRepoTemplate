# 73. Adopt the TypeScript toolchain standard

- **Status:** Proposed (Ben accepts it)
- **Date:** 2026-10-26
- **Supersedes in part:** [0070](0070-vendored-anti-slop-oxlint-rules.md)
  for lint ownership, built-in Oxlint rules and version pins; earlier Biome
  lint assignments are marked with links to this record.

## Context

Ben's TypeScript repositories need one toolchain standard and one owner per
concern. The existing Biome/Jest stack and ADR 0070's narrowly scoped Oxlint
engine describe earlier choices. This record establishes the target; separate
implementation PRs move the installed tools and guidance to it.

Ben approved the whole standard on 26 Oct 2026 at 12:11 GMT:
"Go with the whole standard as proposed". Ben's sign-off, 26 Oct 2026 13:31 GMT,
decision 6, approves the planned lint-rule changes in StyleProof,
AgenticRepoTemplate and SoftwareFactoryTemplate. His decisions 2 and 4 at that
time approve the showcase shim and exact Oxlint 1.89.0 pins respectively.
The ADR remains Proposed; Ben owns acceptance and any head-specific
enforcement approval required by the gate.

## Decision

- **Lint:** Oxlint owns general lint, with built-in rules enabled alongside
  the vendored `dmmulroy/anti-slop` rules. Pin both `oxlint` and
  `@oxlint/plugins` to exactly `1.89.0`, without a caret or tilde.
- **Format:** Biome only formats, retaining its import sorting. Remove
  Prettier where present. Give each lint rule one owner.
- **Remaining ESLint checks:** keep `tooling/eslint-plugin-policy.js`,
  React Doctor (`eslint-plugin-react-doctor`) and rules Oxlint cannot cover.
  Keep React Doctor's separate project checks; remove overlapping ESLint rules
  as their Oxlint replacements land.
- **Unit tests:** Vitest replaces Jest. Run showcase tests through a
  `jest` → `vi` shim outside `showcase/`, loaded only for the showcase project.
  Preserve every recorded showcase byte and every existing test; keep coverage
  thresholds and reports through the migration. Playwright stays for E2E.
- **TypeScript:** use TypeScript 6.0 for compilation, keeping
  `typescript@6.0.3` for typescript-eslint and other tools. TypeScript 7
  typechecks through the alias `"@typescript/native": "npm:typescript@7.0.2"`.
  Run `node node_modules/@typescript/native/bin/tsc` by path, never a bare
  `tsc`, because both installations provide that command.
- **Compiler settings:** retain `strict`, `noUncheckedIndexedAccess` and
  `verbatimModuleSyntax`; add `exactOptionalPropertyTypes`,
  `noImplicitOverride` and `erasableSyntaxOnly` to `tsconfig.base.json`.
  Resolve showcase incompatibilities in program scope, preserving its bytes.
- **Build and packages:** use Vite 8 for web apps and retain pnpm. Every new
  package or version waits for the Security bot's clearance of that exact
  package and version before installation. ADR 0070's earlier clearance does
  not clear the new pins; keep its provenance and installation safeguards.

### Planned PR sequence

The plan orders G1 (vendoring part 13 after #170), T1 (this record), then
T2–T4 (the three base compiler flags), G2 (pinned anti-slop CLI activation)
and G3 (CI/hook wiring). T1 itself has no PR dependency; vendoring and
activation are separate work. G2 may start with built-ins off as a transition;
T16 establishes the target ownership above.

Follow with T5 (Vite 8), T6 (Vitest API), T7 (tooling), T8 (scripts),
T9 (web/UI), T10 (showcase shim), T11 (Vitest coverage), T12 (remove Jest),
T13 (agent guidance), T14 (TypeScript 6), T15 (TypeScript 7 typechecking),
T16 (Oxlint as main linter), T17 (Biome formatting only) and T18 (ESLint
deduplication). These are planned follow-ups, subject to their dependencies
and Security clearance, rather than completed changes.

## Consequences

The standard replaces the previous tool-ownership split while keeping
repository policy checks, test coverage and recorded trial outputs intact.
The migration costs several small, independently verified PRs; retain the
existing gates until their replacements pass equivalent behavioural checks.
Each implementation PR passes typecheck, the existing test count plus any new
tests, full verification and CI, and changes at most 400 lines. Keep
`git diff --stat origin/main -- showcase` empty. Cite Ben's 13:31 GMT sign-off
in each enforcement-changing PR and leave the gate's approval action to Ben.
Revert an implementation PR to restore its previous tooling; this docs-only
record changes no installed package, configuration, gate or runtime behaviour.
