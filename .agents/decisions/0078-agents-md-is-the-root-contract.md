# 78. AGENTS.md is the root contract

- **Status:** Accepted (merged in #200)
- **Date:** 2026-10-28
- **Replaces:** ADR 0053 (deleted) and point 1 of [0022](0022-agent-docs-live-in-dot-agents.md)

## Context

Agents that load only AGENTS.md currently see a pointer to the operating
contract. Ben chose AGENTS.md and REVIEW.md as the root agent files.

## Decision

Move the START_HERE.md body to AGENTS.md, preserving its rules and fixing
relative links. Keep project context under .agents/project/.

Claude Code imports the contract through .claude/CLAUDE.md with a single
@../AGENTS.md line. REVIEW.md starts with @AGENTS.md and stays at root, where Claude Code Review
reads it. skills-lock.json also stays at root, where the skills CLI reads it
(carried from ADR 0053).
Cursor Bugbot follows AGENTS.md and REVIEW.md.

The context check requires AGENTS.md to be a regular file with at least
20 non-empty lines and at most 32 KiB, referencing REVIEW.md. It also checks
that the Claude import is a regular file with the import on its own line.

## Consequences

Agents loading AGENTS.md receive the rules directly. Claude Code has one
import to the same contract. The trial prompts name AGENTS.md; this change
starts a new trial baseline.
