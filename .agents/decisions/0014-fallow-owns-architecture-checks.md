# 14. Fallow owns the architecture graph, gate, and diagram

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The monorepo needs three architecture checks: forbidden imports fail the PR,
a diagram shows how roles connect, and changes to a package's exported API are
reviewed. Fallow already owns architecture drift here. Fallow 3.x adds
`fallow viz` (the import graph as text) and `fallow list --boundaries` (the
role map as JSON). The repo currently resolves Fallow 2.97, which has neither.

## Decision

- **Fallow is upgraded from 2.97 to 3.x** and owns the dependency graph, the
  architecture gate, and the diagram. dependency-cruiser is removed from the
  plan.
- **Gate.** `fallow audit --base <merge-base>` and `fallow architecture` run in
  CI, and a forbidden import fails the PR.
- **Diagram.** A script collapses Fallow's file graph into roles and writes a
  committed role-level diagram. CI regenerates it and fails when the committed
  copy is out of date.
- **API.** Each package has a committed API Extractor report
  (`etc/<package>.api.md`). CI runs `api-extractor run` and fails when the
  report is stale, so export changes appear as a reviewed diff.
- **Role map.** `.fallowrc.jsonc` and any Fallow baseline files are not behind
  the enforcement sign-off ([0021](0021-protect-only-the-files-that-run-the-gates.md)),
  so role-map changes show in the reviewed diff and the role-diagram freshness check.
- Architecture consistency is measured between `main` and the PR head. This
  replaces the two-run comparison.

## Consequences

- One tool owns architecture, which keeps one owner per concern in
  [`TECH_STACK.md`](../project/TECH_STACK.md).
- The role-level diagram stays stable when a PR adds files that follow the
  rules, so its diff only moves when the shape moves.
- Fallow is pinned to an exact version, so a change in its graph output fails
  the diagram check loudly.
- Generated diagram and API report files sit in Biome's ignore list, so the
  committed bytes are the generator's bytes.
