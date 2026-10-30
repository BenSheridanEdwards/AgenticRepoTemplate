# 82. Retire GitNexus, graphify, verify-gates.sh and the ArchitectPlaybook audits

- **Status:** Proposed
- **Date:** 2026-10-29

## Context

Older ADRs still name tools and generated output removed from the template.
Those references describe the setup at the time, but can look like current
instructions without a note at the mention.

## Decision

Record the removals and mark the historical mentions with a link to this ADR:

- #186 deleted the ArchitectPlaybook audits; plan item I4 stopped recommending them.
- #187 and #192 removed GitNexus.
- #107 and #193 removed graphify.
- #194 deleted `scripts/verify-gates.sh`.

Keep the old decisions' wording, statuses and numbers. Add a brief removal
note at each mention and an amended-by entry in each existing header list.

## Consequences

Readers can distinguish the historical setup from current guidance without
losing the reasons for the old decisions. These annotations change no check
or application behaviour.
