# 1. Record architecture decisions

- **Status:** Accepted; amended on 2026-11-03 to allow deleting a fully
  superseded record
- **Date:** 2026-06-17

## Context

An agentic codebase is read far more often than it is written, and increasingly
the reader is an AI agent with no memory of the meeting where a choice was made.
Constraints that exist for a good reason look arbitrary without that reason, and
an agent (or a new engineer) will "helpfully" undo them.

## Decision

We record every significant architectural or process decision as a short
Architecture Decision Record (ADR) in `.agents/decisions/`, numbered
sequentially. Each ADR states the context, the decision, and its consequences.
A later ADR supersedes or amends an earlier one; it does not rewrite the
earlier decision.

Delete an ADR only when it is fully superseded, that is, a later ADR replaced
its whole decision. Delete it once that successor names it, for example
"Replaces ADR 0063 (deleted)", carries anything from it that still applies,
and every inbound link or reference in the repository points to the
successor. Git history keeps the deleted record, and its number is not
reused. An ADR that is only amended stays, with a status pointer to each
amending ADR.

## Consequences

- The *why* travels with the repo and is in an agent's context window.
- "Change the rule, don't work around it" becomes concrete: you write an ADR.
- A small ongoing cost — one short file per real decision. Trivial choices do
  not get an ADR.
