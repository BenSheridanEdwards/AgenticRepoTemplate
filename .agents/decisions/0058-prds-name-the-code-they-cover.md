# 58. PRDs name the code they cover

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-23
- **Builds on:** [0041](0041-scripts-ask-the-tool-which-files-a-glob-covers.md), [0045](0045-prds-state-intent-and-link-their-specs.md)

## Context

ADR 0045 links each PRD behaviour to the E2E test that proves it. It does not
identify the implementation files governed by that intent. A later PR-impact
check needs that relationship as data, shared across agents and harnesses,
rather than a reviewer guessing which feature a changed file belongs to.
Issue #132 adds the coverage declarations and validates them through the
existing documentation gate, following the North Star's principle that the
repository carries the standards.

## Decision

- Each tracked PRD directly in `docs/prd/` has exactly one `- **Covers:**`
  line in its header, before its first `##` section. Its value is one or more
  comma-separated repository-relative globs, each in a single-backtick code
  span. For example:

  ```md
  - **Covers:** `apps/web/src/routes/greeting/**`, `apps/api/src/features/greeting/**`
  ```

- Paths use forward slashes within the repository. Absolute paths, parent
  traversal and backslashes are unreadable declarations, as are empty values,
  unquoted globs, duplicate Covers lines and Covers lines outside the header.
- `scripts/check-prd-conflicts.mjs` reports a conflict when a PRD lacks that
  line, the declaration is unreadable, or any declared glob matches no tracked
  file present in the working tree. It uses `matchesGlob` from `node:path`,
  keeping glob semantics with the platform as ADR 0041 requires. Each glob
  must match independently; another valid glob does not hide a stale one.
- Export the existing `parseBehaviours(prdPath, text)` parser, extended to
  include the Covers declaration alongside its behaviours and diagnostics.
  Export `coveredPaths(prd)` as the deduplicated union of declared glob
  strings and the repository-relative spec paths in parsed `Proved by` links.
  Linked specs are covered automatically, with their existing path
  normalization and anchor removal. Their existing proof validation stays in
  place.
- Keep the glob strings in that shared coverage result rather than expanding
  them to the current file list. A later changed-file check can then match a
  file deleted or renamed by the PR, using the same parser and coverage data.
- Add Covers to the PRD template and the greeting PRD. The greeting names its
  route, page-header feature and api greeting feature; the api feature glob
  includes its procedure, application and domain. Its linked greeting and
  accessibility specs count automatically.

## Consequences

- `pnpm check:docs`, and therefore `pnpm verify`, pre-push and CI, reject a
  missing, malformed or stale coverage declaration. Tests cover those failures
  and the reusable parser and coverage helper.
- Moving the last tracked file out of a declared glob requires a corresponding
  PRD update. A broad but matching glob can still overstate a feature's scope;
  review checks that the declaration names the code the PRD actually governs.
- This is the data prerequisite for the separate PR-impact check. It adds no
  PR-body field, product-intent approval guard, dependency, workflow or hook.
  The E2E behaviour map remains the product contract.
