# 119. Describe enforcement changes in plain English

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
`uses` value, capped at 80 characters; use only the first line of a run block.
Describe action pin changes with the short commit SHA beside any trailing
version comment. Version comments are unverified PR text, so the SHA identifies
the actual pin. When a commit changes but its comment stays the same, name the
new commit rather than claiming a version bump. Deduplicate reasons before
truncating them and join them in one cell with consistent capitalisation.

Keep the JSON leaf-diff reasons and their enforcement classification. For other
edits, count added and removed line occurrences; describe a pure reordering or
line-ending change explicitly. Describe added and deleted files clearly. The
reader recognises ordinary block YAML. Describe matched steps whose text
changes beyond `uses` as changed steps. Compare the remaining text after taking
out recognised step and job blocks, and append its line summary whenever it
differs. Thus a recognised bump cannot hide an unrecognised command, condition,
trigger or permission edit. Describe pure step reordering as such. Use an
unnamed-step fallback for flow YAML. The reader never executes or imports PR code.

Bound the table to 100 rows and 48,000 UTF-8 bytes, leaving room below GitHub's
65,536-character comment limit for the fixed text, omission notice and approval
label. Omitted rows still require sign-off and direct the maintainer to the full
diff. Use the same row budget for unticked and labelled bodies. Parse version
comments with a linear string search, reduce indentation candidates rather than
spreading arguments, and bound the workflow job to ten minutes.

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

One-time migration consequence: after this merges, open PRs' existing labelled
sign-off comments no longer match `isLabelled` against the new rendered body.
Their next gate run rewrites them unticked, so the maintainer must re-tick each
current head. The fresh-tick and approval planning rules stay unchanged.
