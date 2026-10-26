# 70. Vendored anti-slop rules through a narrowly scoped Oxlint engine

- **Status:** Proposed
- **Date:** 2026-10-25
- **Follows:** [0010](0010-lint-engine-ownership.md),
  [0011](0011-effect-schema-everywhere.md),
  [0024](0024-sign-off-only-loosening-enforcement-changes.md) and
  [0063](0063-advisory-declarative-style-lint.md)
- **Amends:** [0046](0046-fail-lint-on-warnings.md) only for the separate
  report-only advisory command described below.

## Context

Ben requested an anti-slop rollout for TypeScript projects on 25 October 2026.
The rules identify weak type contracts, module mocking, avoidable transforms
and unreadable spacing. Biome owns formatting and general lint; ESLint owns
policy and React rules. A third engine earns its place only by running the
vendored anti-slop plugin, with existing ownership preserved. These rules are
distinct from the ESLint policies in [0050](0050-anti-slop-lint-policies.md).

Security cleared the rollout with caveats at 23:20 GMT on 25 October 2026;
Ben instructed the build at 23:24 GMT. This records that clearance for upstream
commit `13909c9e07590f5a85d93c62712259fe14a883f7`, the two packages and both
platform bindings below. Ben's amendments replace the plan's proposed 1.81.0
pins and vendoring size exemption. The ADR remains Proposed.

## Decision

### Provenance and safe installation

Copy only the verified, Security-supplied checkout of `dmmulroy/anti-slop` at
`13909c9e07590f5a85d93c62712259fe14a883f7`. Map upstream `src/<path>` to
`vendor/anti-slop/<path>` and upstream `LICENSE` to
`vendor/anti-slop/LICENSE`. Preserve the nested Stylistic licence and provenance.
Record the commit, copied paths, omitted upstream tests and SHA-256 hashes in
`vendor/anti-slop/UPSTREAM.md`. Keep every vendored source byte-identical;
verify whole files against `UPSTREAM.sha256` and split-file prefixes against
`UPSTREAM.prefixes`, supplied with the cleared snapshot. A hash-check test
protects the completed vendor tree. Upstream RuleTester suites remain upstream;
the wiring piece adds seeded tests against the real CLI instead.

There is no official anti-slop npm package. Install neither
`oxlint-plugin-anti-slop` nor a similarly named substitute. Copy files only:
run nothing in the upstream checkout, and use neither `npx skills`, README
bootstrap commands nor upstream `install.mjs`. These unpinned entry points
fall outside the clearance.

Pin root devDependencies `oxlint` and `@oxlint/plugins` to exactly `1.78.0`,
without a caret or tilde. Install only with `--ignore-scripts`; use
`pnpm install --frozen-lockfile --ignore-scripts` for the locked tree. Keep
React Doctor's transitive Oxlint 1.81.0 unchanged. Preserve lockfile integrity
hashes and run Security's binding check after installation: it must report
`BINDING_CHECK=pass` for both packages and
`@oxlint/binding-darwin-arm64` and `@oxlint/binding-linux-x64-gnu` at 1.78.0.
Security's `BINDING_OK` marker must exist before running Oxlint, including
through hooks or `pnpm verify` once they invoke it.

Skip optional peers `vite-plus` and `oxlint-tsgolint`. Never set
`NAPI_RS_NATIVE_LIBRARY_PATH`, `VP_VERSION` or `OXLINT_TSGOLINT_PATH`; run with
all three unset through `env -u NAPI_RS_NATIVE_LIBRARY_PATH -u VP_VERSION
-u OXLINT_TSGOLINT_PATH`. Pin any added GitHub Action to a full commit SHA
with a version comment. Exclude `vendor/anti-slop/` and agent directories
from lint and formatting; their separate human/Claude review and vendor hash
checks remain required. Review the config and source diff before autofix;
autofix belongs only in its planned follow-up pieces.

### Engine ownership and rule split

Use root `.oxlintrc.json` as data rather than executable configuration.
Disable every built-in Oxlint plugin and category (`plugins: []`, all
categories `off`), leaving all built-in rules off. In particular,
`oxc/no-accumulating-spread` stays off because Biome's
`performance/noAccumulatingSpread` owns that concern. Load only the generic
and Effect plugins from `vendor/anti-slop/`. Biome retains ownership of
explicit `any`; anti-slop's dictionary rule adds the broader value contracts.

The clean rules ship at `error`: `no-module-mocking`, `no-reflect-apply`,
`no-reflect-get`, `no-unknown-type-aliases`, `no-widen-then-assert`, and
`no-reduce-accumulator-copy`. Scope `no-runtime-typeof` to package sources:
`apps/*/src/**`, `packages/*/src/**` and `showcase/*/*/src/**`.
Enable all three Effect tag rules at `error`:
`no-manual-effect-error-tag`, `no-manual-tag-comparison` and
`no-manual-tagged-construction`. Keep `prefer-effect-match` and
`no-service-constructor-imports` off: domain functions stay plain, and this
repo does not use Effect Layers/services. Preserve the default
`allowInTypeGuards: false` and the upstream spacing behavior.

The noisy rules start at `warn` in `tooling/anti-slop/advisory.json`, which
extends the gate config: `require-readable-spacing`,
`require-safety-comment-for-type-assertion`, `no-shape-in-symbol-names`,
`no-array-filter-map`, `no-known-value-widening`, `no-unsafe-dictionary-type`,
`no-unknown-parameters`, `no-object-parameters`, `no-chained-type-assertions`,
`no-conditional-empty-object-spread`, and `no-unknown-returns`, plus
`no-runtime-typeof` outside the package-source override. Planning counts
are estimates; the wiring piece verifies the split with real CLI results.

`pnpm lint:anti-slop` runs
`oxlint --config .oxlintrc.json --deny-warnings --no-ignore`
with the environment restrictions above. Run it in the existing CI `quality`
job, `pnpm verify` (and therefore pre-push), and pre-commit. The gate contains
only error-level rules, so every finding fails. No additional required job
or branch-protection change is needed. Measure hook and CI runtime, including
the pre-commit budget in [0062](0062-pre-commit-steps-stay-under-30-seconds.md).

`pnpm lint:anti-slop:advisory` selects the separate advisory config explicitly.
It runs outside CI gates, `pnpm verify` and hooks: the same scoped exception
to ADR 0046 made by ADR 0063. Promote a noisy rule to the gate at `error`
in the PR that clears its last finding. Existing lint gates remain strict.

Exclude the six recorded trial folders by name: `showcase/todo-01/**`,
`showcase/todo-02/**`, `showcase/todo-03/**`, `showcase/todo-codex-01/**`,
`showcase/todo-codex-02/**`, and `showcase/todo-codex-03/**`. Preserve their
recorded bytes, following [0059](0059-preserve-recorded-trial-outputs-in-duplication-analysis.md).
Future trial IDs stay covered. Exclude named agent directories, not every
dot-folder; `.github/` and `.husky/` remain owned code. Future comparisons
record the scaffold revision at which the gate arrived.

### Enforcement approval and agent workflow

Extend `GUARDS` in `scripts/enforcement-approval.mjs` before CI workflows.
Every addition, edit or deletion under `vendor/anti-slop/**` or of any
`oxlint.config.*`, including nested configurations, uses `rewrite()` and
asks for enforcement approval. Root and nested `.oxlintrc.json` use
`byJson(['$schema'])`: removing or weakening a rule, adding ignores,
changing override coverage or disabling plugins asks; adding an error rule
or raising `warn` to `error` passes. Use `off`/`warn`/`error` spellings;
unrecognized severity changes are conservatively reviewed. Renames retain
the existing protection of both paths.

`tooling/anti-slop/advisory.json` remains unguarded because it gates nothing.
This change leaves `package.json` outside the guard; reviewers check script
wiring. Main's gate judges PRs, so the extension takes effect after landing.
This piece changes the gate itself and therefore needs Ben's head-specific
sign-off. Builders leave the enforcement checkbox to Ben and his orchestrator.

The workflow piece adds `pnpm lint:anti-slop:changed`: run the advisory CLI
in JSON mode, intersect findings with added lines from
`git diff -U0 origin/main...HEAD`, print file/line/rule/message and fail on
any finding. Codex clears each finding before pushing; Claude Opus (Claude
Code) runs it on the PR head and raises each finding as a change request.
Findings on untouched lines stay with their named cleanup pieces. Review
checks the truth of `SAFETY:` comments and rejects changes that merely hide
a finding. Keep this command outside automated gates and hooks.

Later pieces update the guidance reached through `AGENTS.md` and `CLAUDE.md`,
`REVIEW.md`, the PR template, quality/stack/convention/Definition of Done
docs, agent manifests and relevant skills; the orchestrator updates factory
prompts. The wiring piece rejects `oxlint-disable`/`oxlint-enable` directives
through `check:suppressions`. In the
[pinned Oxlint source](https://github.com/oxc-project/oxc/blob/c42d6397eab5b2d5bb2bd6746c57bc2a9cad21bd/apps/oxlint/src/lint.rs),
explicit `--config` disables nested discovery. `--no-ignore` disables
`.eslintignore` filtering while root `ignorePatterns` still apply; git ignores
retain their existing behavior. The wiring piece proves that nested empty
configs and `.eslintignore` cannot hide a seeded finding, and the configured
vendor/trial exclusions still hold.

### Rollout and proof

Piece A adds only this ADR and the guard with tests written first. Dependencies,
vendored code, configs, commands and workflow updates arrive in separate PRs.
Split vendoring into inert PRs of at most 400 changed lines, with no imports or
runtime wiring until the tree is complete. Each PR names the cleared commit,
states that its upstream code is unmodified and hash-checked, and identifies
the line range for each split file. The 400-line limit includes the lockfile
unless the repo's size check excludes it. No vendoring size exemption applies.

Follow with gate wiring, agent workflow and focused cleanup/promotion pieces.
Spacing autofix ships later in separate PRs of at most 400 changed lines;
review the source/config diff first, then run Oxlint fix, Biome format and
lint again, proving a second pass leaves no diff. Keep semantic fixes separate.
Each piece passes the full local suite and latest-head CI before delivery.

The wiring tests seed violations and clean examples for every gated rule,
warning rejection, exclusions and nested-config protection. Check React Doctor
before and after wiring. Node 22 native type stripping loads vendored sources;
the repo does not type-check them, so real CLI tests catch plugin API drift.
Exact pins, integrity checks and separate review contain the added executable
supply-chain surface. Reverting a rollout piece restores its prior behavior;
upstream updates require a fresh reviewed, hash-verified change.
