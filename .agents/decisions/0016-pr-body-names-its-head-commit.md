# 16. The PR body names the head commit it was checked against

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

A PR body is written against one head, then more commits get pushed. Nothing
forced the body to follow, so it kept describing the older head:

- #57's body said "All four commits are Conventional Commits" and described
  head `16b1728`. The branch had five commits at head `0a21f68`, and the fifth
  (the `MAP_ROOT` fix) was never described.
- #55's body said "The pre-commit hooks passed on both commits." The branch has
  four.
- #51's body said "Latest-sha GitHub Actions: these will report after the
  push." and was never updated once they did.
- #62 cited #55's original SHAs `61691f7`/`5d0ae00` instead of its own
  cherry-picks `5fa0bbf`/`9f82a22`.

The `PR quality` workflow already re-runs on `synchronize`, but it only checked
structure, so a stale body still passed.

## Decision

The Verification Summary carries a `- Head commit:` line: the SHA the whole
body was last checked against. `scripts/validate-pr-body.mjs` fails when the
line is missing, when its value is anything but one SHA (7-40 hex characters,
optionally in backticks; `None` and prose fail), or when that SHA is not a
prefix of the PR head SHA. A note in the label (`- Head commit (short):`) is
still the field, and the SHA may sit on the next line. The error names the fix:
re-check the body against the new head, then update the field.

The workflow passes the head as `PR_HEAD_SHA` from
`github.event.pull_request.head.sha`, through the environment like the body.
Run locally without it, the validator uses `git rev-parse HEAD`. In GitHub
Actions, or whenever `PR_HEAD_SHA` is set, a value that is not a 40-character
SHA fails the check instead of falling back, because the CI checkout is a merge
commit, not the PR head.

## Consequences

- Every push needs a body edit before the check is green again. That is the
  point: the edit is when the author re-reads the body against what was pushed.
- PRs open when this merges fail until their bodies add the field.
- A re-run of the workflow grades against the event payload's head, which is
  the head at that event. The newest push's run is the one that counts.
- The check proves the author touched the body at this head, not that every
  sentence is true. Review still reads it.
