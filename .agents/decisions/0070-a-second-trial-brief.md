# 70. Add a second trial brief

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-26
- **Amends:** [0034](0034-trial-harness-and-evidence.md), [0048](0048-trial-tasks-and-codex.md)

## Context

The North Star identical-build proof needs more than one app brief. Todo
alone cannot show whether independent agents follow the same scaffold for a
different contract. The harness currently treats its prompt, lockfile scope
and browser acceptance spec as Todo-specific.

## Decision

Add a Notes brief with create, list and delete operations over id, title and
body. Keep Todo's setup, checks and landing rules. Read built-in task prompts
from the pinned scaffold and include the Notes task in the harness hash.
Allow only the result's own lockfile importers for an in-repository showcase
brief; keep every other importer outside scope.

Run each trial id against its brief's fixed acceptance spec. Keep the existing
Todo acceptance for generic showcase fixtures. Specify blank-title rejection,
optional body text, reload persistence, deletion and accessibility in Notes
acceptance tests.

## Consequences

The harness hash changes, so the rerun requires a new shared baseline.
Keep trial outputs unchanged. Deliver per-brief API contracts and comparison
reporting in the companion piece before rerunning both briefs. This split
keeps each handwritten change reviewable; it adds no dependency or gate exemption.
