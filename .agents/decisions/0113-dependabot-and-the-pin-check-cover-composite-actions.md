# 113. Dependabot and the pin check cover composite actions

- **Status:** Accepted (merged in #304)
- **Date:** 2026-11-03
- **Amends:** [0099](0099-pin-every-action-by-commit-sha.md)

## Context

`.github/actions/setup/action.yml` pins actions/setup-node v6.5.0 for every CI
job that uses it. Dependabot scanned only `/`, so #274 bumped setup-node to
v7.1.0 in the workflows and missed the composite. `pnpm gates:check` read only
workflows, so the half bump passed.

## Decision

Have Dependabot scan `/` and `/.github/actions/*` and group by dependency name,
so one PR bumps an action everywhere. Have the required-gates contract read each
composite matching `.github/actions/*/action.{yml,yaml}` and apply the full-SHA
and one-commit rules to contract actions across workflows and composites,
naming each file that holds a pin.

## Consequences

A bump that skips a composite fails Required gates and names the file. A new
composite is checked without an edit to the contract. Composite edits stay
guarded by enforcement-approval in the CI workflows area, so the composite bump
for #274 lands with #274 and its sign-off.
