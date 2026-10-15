# 10. Lint engines own disjoint concerns

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The guardrails need policy rules (component shape, handler naming, loop and
import bans, hooks rules, React Compiler rules) that Biome does not provide.
[`TECH_STACK.md`](../project/TECH_STACK.md) gives each concern one owner and
currently names Biome as the only linter. React Doctor adds React-specific
diagnostics on top.

## Decision

Each engine owns a separate set of concerns:

| Concern | Owner |
| --- | --- |
| Formatting and general lint | **Biome** |
| Policy rules, React hooks rules, React Compiler rules | **ESLint** |
| React Doctor rules | **ESLint** through `eslint-plugin-react-doctor` where a rule is expressible there, and **React Doctor** in CI for the rest |

React Doctor is part of the lint toolchain, and its rules block like any
other lint rule.

This record supersedes the lines that rule out ESLint in
[`TECH_STACK.md`](../project/TECH_STACK.md),
[`QUALITY_GATES.md`](../project/QUALITY_GATES.md), and `AGENTS.md`.

## Consequences

- Each rule still has exactly one owner, so an agent knows which tool reports
  a given finding.
- Plan PR 1 installs ESLint and React Doctor and rewrites the superseded doc
  lines in the same change, so the docs match the tooling the moment it lands.
- Plan PR 7 adds staged policy lint to pre-commit and full lint to pre-push,
  mirrored in CI.
