# 118. Describe enforcement changes in plain English

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-04
- **Amends:** [0024](0024-sign-off-only-loosening-enforcement-changes.md),
  [0060](0060-product-intent-needs-sign-off.md)

## Context

The sign-off table names each guarded file but calls most edits enforcement
code changes. The maintainer must read the diff to learn whether a workflow
bumps an action, adds a job or removes a check.

The workflow runs main's checkout through `actions/github-script`. Its summary
reader can use Node built-ins only. Approval compares the rendered body with
this head's expected comment, so identical inputs must produce identical text.

## Decision

Describe each guarded file's change in plain English derived deterministically
from its before and after text. A small indentation-based workflow reader names
added and removed jobs and steps. Name a step by its `name`, then its `run` or
`uses` value. Describe action pin changes using the trailing version comment
when present, otherwise the ref. Join several recognised changes briefly in the
same cell, retaining the existing limit on displayed reasons.

Keep the JSON leaf-diff reasons and their enforcement classification. For other
edits, count added and removed line occurrences; describe a pure reordering or
line-ending change explicitly. Describe added and deleted files clearly. The
reader recognises ordinary block YAML, and uses the line summary for changes
it cannot describe specifically. It never executes or imports PR code.

Pass every PR-derived name, version and path through the existing `inert()`
escaping. Preserve the head-bound fresh-tick protocol, author checks and status
semantics. Regression tests exercise summaries containing hostile Markdown and
verify that identical inputs preserve the comment and a legitimate labelled tick.

## Consequences

The maintainer can read common workflow changes directly in the sign-off table.
The summary is a review aid; the diff remains the source for full YAML semantics
and edits outside the reader's recognised forms. No dependency is added.

The new summaries take effect after this guarded script change merges. This PR
still waits for the maintainer's fresh tick on its head, as ADR 0024 requires.
