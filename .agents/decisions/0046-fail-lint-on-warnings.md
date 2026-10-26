# 46. Fail the lint gates on warnings

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-20
- **Amends:** [0032](0032-api-ui-greeting-and-contract.md), dropping the
  `apps/web/src/features` autoDiscover from the `web-features` zone and giving
  the reference app a web feature, so the strict audit no longer warns on an
  empty optional zone (see Decision)
- **Follows:** [0002](0002-quality-gates-as-code.md) and
  [0039](0039-block-inline-lint-disable-comments.md), which keep each gate red
  until the code is clean

## Context

Every Biome rule carries a severity. A rule set to `warn`
(`noNonNullAssertion` in `biome.json`), and every recommended rule that defaults
to `warn` (such as `noTemplateCurlyInString`), printed a warning yet still
passed `pnpm check`, `pnpm lint`, the pre-commit hook and the CI `quality` job.
The north star is a linter that stays red until the agent closes the loop, so a
warning the gate accepts is a standard the gate does not hold.
`tooling/architecture/typescript.test.ts` held one such warning: a plain string
carried a `${name}` placeholder.

Fallow warned on the `web-features` zone too. The web feature demos left in
[0032](0032-api-ui-greeting-and-contract.md), so no result holds a web feature.
The zone kept an `autoDiscover` of `apps/web/src/features`, a folder that no
longer existed, and its parent zone matched no file, so `pnpm fallow:audit` and
`pnpm arch:gate` each warned. The role stays real: a route composes a web
feature, and the contract and its tests keep the role.

## Decision

**Biome fails on a warning.** Every Biome lint/check gate invocation passes
`--error-on-warnings`: the `check` script (which the CI `quality` job and
`pnpm verify` run), the `lint` script, and the `biome check --staged` call in
`.husky/pre-commit`. The formatter `biome format --write` does not take the
flag, so it stays as is. A warning of any Biome rule, configured or recommended,
fails the run. No rule severity drops; the flag escalates every warning, so a
new recommended warning fails without a config change. The string placeholder
in `typescript.test.ts` became a template literal, with no suppression.

**The `web-features` zone holds a member.** The reference app gains a
`page-header` web feature that the greeting route composes, so the zone matches
a file and the audit is clean. The zone drops its `autoDiscover`: a web feature
is optional, unlike a route, so the reference holds the only one, and a zone
with a single slice has no sibling to isolate inside Fallow. ESLint
`policy/slice-isolation` keeps one web feature from importing another, for every
result, as it already did (`scripts/eslint-policy.test.ts`).

This amendment to [0032](0032-api-ui-greeting-and-contract.md) weakens feature
sibling isolation for the reference app, and Ben accepts it by approving the
PR. [0032](0032-api-ui-greeting-and-contract.md) gave sibling isolation two
owners and called the Fallow child zones "as strong as before": ESLint
`policy/slice-isolation` for every result, plus Fallow child zones for
`apps/web`. Dropping the `web-features` `autoDiscover` removes the second owner
for features, so a feature-to-feature import is now caught by ESLint alone, not
by Fallow as well. This is asymmetric with routes, which keep their
`autoDiscover` and so keep both owners, and it is permanent, not only while the
reference holds one feature: without `autoDiscover` the zone never re-splits
into per-feature child zones, however many features a result adds. The seeded
test case that proved the Fallow owner, `'a feature imports another feature'`
in `tooling/architecture/boundaries.test.ts`, is removed, because Fallow no
longer reports that boundary; the ESLint owner keeps its own seeded test
(`scripts/eslint-policy.test.ts`).

**Rejected alternative.** Removing the `web-features` zone and role outright
was rejected. The role is woven through the contract: `contract.mjs` lists it
as an optional role, `contract.test.ts` asserts the role list, `roles.mmd`
draws it, and the `.agents/project/ARCHITECTURE.md` contract table and the
`boundaries.test.ts` cases reference it. Dropping the role would also mean a
future feature file sits in no zone and fails `coverage.requireAllFiles`. On
Fallow 3.33.1 there is no option to allow an empty zone, and with `autoDiscover`
kept over a single feature the parent zone still warns `matched 0 files`, so
keeping the role and dropping only the `autoDiscover` is the minimal clean
change.

**Guarded files.** `.husky/pre-commit` runs the gates, so it waits for
BenSheridanEdwards to tick the `enforcement-approval` sign-off for the head
commit ([0023](0023-protect-only-the-files-that-run-the-gates.md),
[0024](0024-sign-off-only-loosening-enforcement-changes.md)). `biome.json` stays
unchanged, so only the hook needs the tick.
