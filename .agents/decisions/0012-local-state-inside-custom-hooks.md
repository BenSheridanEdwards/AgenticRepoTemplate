# 12. Local state lives inside custom hooks

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

Three sources described local state three ways. The guardrails allow
`useState` for local UI state, the North Star draft bans casual `useState` and
`useEffect`, and [`CONVENTIONS.md`](../project/CONVENTIONS.md) derives values
with `useMemo`. `useServiceStatus` fetches inside an effect, which the
guardrails assign to TanStack Query once it lands.

## Decision

- The guardrails wording is the rule.
- `useState` and `useEffect` are called only inside custom hooks whose names
  start with `use`. A lint rule enforces it.
- Derived values are calculated during render.
- The North Star state line changes to match this rule when that document
  lands on `main`.
- `useServiceStatus` moves to TanStack Query in plan PR 4.

## Consequences

- Components stay declarative. Every stateful behaviour has a named hook that
  can be tested on its own.
- Server state has one owner, TanStack Query.
- `src/shared/async-resource` is removed once nothing else uses it.
- [`CONVENTIONS.md`](../project/CONVENTIONS.md) is updated by the PR that adds
  the lint rule.
