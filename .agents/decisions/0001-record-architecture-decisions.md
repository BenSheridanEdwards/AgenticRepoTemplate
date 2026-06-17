# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

An agentic codebase is read far more often than it is written, and increasingly
the reader is an AI agent with no memory of the meeting where a choice was made.
Constraints that exist for a good reason look arbitrary without that reason, and
an agent (or a new engineer) will "helpfully" undo them.

## Decision

We record every significant architectural or process decision as a short
Architecture Decision Record (ADR) in `.agents/decisions/`, numbered
sequentially and never deleted (supersede, don't erase). Each ADR states the
context, the decision, and its consequences.

## Consequences

- The *why* travels with the repo and is in an agent's context window.
- "Change the rule, don't work around it" becomes concrete: you write an ADR.
- A small ongoing cost — one short file per real decision. Trivial choices do
  not get an ADR.
