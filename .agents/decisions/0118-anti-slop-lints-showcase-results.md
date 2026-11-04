# 118. Anti-slop lints showcase results

- **Status:** Accepted (the maintainer approved this change)
- **Date:** 2026-11-04
- **Supersedes:** [0080](0080-oxlint-skips-every-showcase-result.md)
- **Amends:** [0115](0115-the-todo-research-project.md) for the review config
  and [0098](0098-oxlint-replaces-eslint.md) for anti-slop scope

## Context

Trial agents build under `showcase/<id>/`, including inside their check
clones. ADR 0080's blanket ignore lets those sources pass `pnpm lint:anti-slop`
and `pnpm verify` without running the vendored anti-slop rules. ADR 0115's
research review worked around that gap with a copied config that dropped
the ignore. The maintainer approved applying the same lint scope everywhere.

Main currently tracks no file under `showcase/`. The policy config already
includes showcase source files. Fallow has no showcase ignore in its discovery,
duplication or health lists; its scaffold export exemption has another purpose.

## Decision

Remove only `showcase/**` from `.oxlintrc.json`'s `ignorePatterns`. Keep the
other ignores, rules, severities and package-source override unchanged. Keep
`oxlint.config.ts` and Fallow's config unchanged.

Have `tooling/trial/review.mjs` pass `.oxlintrc.json` directly to Oxlint,
alongside its existing policy pass. Delete the config-copy logic and the
`unignore` and `unignored` fields. The review schema remains version 1:
no review record is tracked yet, so there is no stored record to migrate.

Keep the review in the research loop only. It records findings and judgment
without changing a run's status. CI, hooks, `pnpm verify`, PR gates and
confidence grading keep their existing entry points.

## Consequences

Every existing anti-slop invocation includes showcase results, including
the checks in trial clones. Findings must be fixed in the source. Failed
runs can still have mechanical findings recorded by the research review.

The lint regression tests seed generic and package-source violations under
Todo, Codex Todo, Notes and arbitrary result IDs, then prove clean code passes.
The review test proves findings are recorded without a copied config or a
change to the original config. The reviewer prompt describes neither the old
ignore nor the copy, so it stays unchanged.

Revert this change to restore the old ignore and research-only config copy.
No dependency is added.
