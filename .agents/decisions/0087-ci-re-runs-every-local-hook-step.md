# 87. CI re-runs every local hook step

- **Status:** Proposed
- **Date:** 2026-10-31
- **Builds on:** [One fail-closed required-gate contract](0017-required-gates-aggregate.md), [Block the common hook bypasses, not only the long flag](0027-block-common-hook-bypasses.md)

## Context

CI repeats the local checks, but the required-gate contract checked lane
wiring rather than the commands inside it. Removing `pnpm lint:anti-slop`
from the quality lane still passed `pnpm gates:check`. A commit made without
local hooks could then merge without that check running anywhere.

## Decision

Add `HOOK_STEPS` to the required-gate contract. Map every command in
`.husky/pre-commit`, `.husky/pre-push` and `.husky/commit-msg`, and every
`package.json` `verify` step, to its workflow, required lane and CI steps.
Read the hooks and manifest during `pnpm gates:check`. Ignore comments and
standalone `echo`, `set` and `unset` commands. Fail on an unmapped command,
a missing CI step, or a lane outside the aggregate and branch protection.
Generate the mapping in the required-gates inventory.

CI Biome checks the whole tree, and the secret scan checks full history.
Fallow's action must use `command: audit`. Architecture checks map to all
three CI steps. The aggregate judges the distributed `verify` suite, with
every child command checked separately. PR-title validation repeats
commitlint because the squash commit uses the PR title.

## Consequences

Adding a hook command or a `verify` step requires its CI equivalent and a
mapping in the same change. Tests remove and add commands in memory, alter
the Fallow action input, and run the CLI against a copy missing anti-slop.
Hooks, workflows and lane names stay as they are.
