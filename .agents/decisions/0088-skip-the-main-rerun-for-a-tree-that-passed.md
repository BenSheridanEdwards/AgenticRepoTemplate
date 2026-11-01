# 88. Skip the main rerun for a tree that already passed

- **Status:** Proposed
- **Date:** 2026-10-31
- **Builds on:** [One fail-closed required-gate contract](0017-required-gates-aggregate.md)

## Context

Every squash merge reran the whole CI suite on `main`. The `Branch contains
main` gate means a merged PR already contained main, so the squash commit has
the PR head's exact tree. The PR's `Required gates` run had already judged that
tree, and the rerun repeated it. On the private repos with self-hosted runners,
these reruns cost hundreds of runner minutes a week.

## Decision

CI no longer triggers on push. `main-tree.yml` runs on every push to main and
calls `scripts/main-tree-passed.mjs`. The script reads the pushed commit's tree
and its pull requests from the GitHub API. It skips the rerun only when a
merged PR into main has the same head tree and its latest `Required gates`
check run succeeded. Otherwise, including a direct push, a different tree or
any API error, the workflow dispatches the full `ci.yml` on main.

## Consequences

A merge that matches a passed tree gets no CI run on main; the PR's checks are
its evidence. A merge after main moved, a direct push or a failed lookup still
runs everything. CI can also be dispatched by hand. Lanes, the aggregate and
branch protection are unchanged.
