# 102. React Doctor rules run as an Oxlint plugin

- **Status:** Proposed
- **Date:** 2026-11-01
- **Amends:** [Oxlint replaces ESLint](0098-oxlint-replaces-eslint.md)

## Context

The ESLint React Doctor plugin wraps the same rules exported by
`oxlint-plugin-react-doctor`. Moving their execution to Oxlint needs equivalent
rule selection and settings before ESLint can leave.

## Decision

Add `oxlint-plugin-react-doctor` at exactly `0.9.18`, already resolved in the
lockfile. Load it as an Oxlint JS plugin for every result's source files.
Keep `portedRuleMode: curated` and all 349 checks currently enforced by ESLint.

Build the selection from `RECOMMENDED_RULES`. Exclude the 54 checks owned by
Biome or React hooks, preserving each owner comment. Exclude unused framework
families only when the preset severity is `warn`. Promote the rest to `error`
and include `prefer-function-component` explicitly. Of the 340 exports outside
the preset, that explicit rule runs and the other 339 stay absent.

Keep ESLint's configuration and the React Doctor CLI command unchanged during
the migration. The CLI keeps its project checks. The parity test compares
ESLint and Oxlint settings and the exact 349 names; runtime fixtures prove
fetch-in-effect and class-component findings and Biome's image-alt ownership.

### React Doctor CLI

This carries the CLI split from ADR 0015 (deleted). The Oxlint plugin runs
React Doctor's per-file rules. `pnpm react-doctor` runs the project checks
the plugin cannot express, as `react-doctor . --no-lint --no-supply-chain
--no-telemetry --blocking warning --yes`. `--no-lint` leaves per-file rules
to Oxlint, `--no-supply-chain` leaves dependency risk to `pnpm audit` and
Dependabot, `--no-telemetry` keeps the scan off the network, and `--blocking
warning` fails the run on a warning. Both React Doctor packages stay pinned
to exact versions. `singleOwnerRules` in `oxlint.config.ts` names the owner
of each rule that another engine also implements.

## Consequences

The temporary overlap preserves the existing checks until ESLint retires.
All configured React Doctor rules are errors. The dependency and lockfile pin
stay exact; reverting this change restores ESLint-only React Doctor linting.
