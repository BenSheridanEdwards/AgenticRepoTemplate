# 112. Grade docs-only pull requests on their gates

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-11-03
- **Amends:** [0067](0067-grade-merge-confidence-on-changed-file-line-coverage.md),
  [0068](0068-grade-merge-confidence-on-import-blast-radius.md),
  [0093](0093-docs-only-lane-scope.md)

## Context

ADR 0093 skips the coverage upload and blast-radius collection for docs-only
changes. ADR 0067 and ADR 0068 grade missing evidence red. The workflow's empty
coverage stub fails the coverage parser, and blast radius has no stub. Every
docs-only PR therefore graded red, including #297, which changed an ADR, the
glossary and the North Star and had every required gate green.

## Decision

Classify changed files in `scripts/confidence-label.mjs` with the same
`docsOnly()` from `scripts/docs-only-scope.mjs` that CI uses to skip those lanes.
For a docs-only change, grade on the required gates and the other gaps, waive
unavailable unit coverage and blast-radius evidence, and state in the grade
that both do not apply. Grade evidence that is present using the existing rules.

Keep missing evidence red for code changes, mixed changes, empty file lists,
and file lists at or above `LIST_FILES_LIMIT` (3000). The PR files API lists at
most that many files, so a list at the cap may hide code in a longer change.
Keep a failing or pending required gate red.

## Consequences

The trusted workflow runs main's script, so the waiver applies once this merges.
The `{}` stub in `confidence.yml` becomes redundant. Remove it in a later PR
with the sign-off required for a guarded workflow edit.

A wrong docs-only classification would skip evidence. CI already trusts the
same classifier to skip the lanes, so the waiver adds no new path.
