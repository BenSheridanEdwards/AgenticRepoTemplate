# Agent Guardrails and Enforcement

## Purpose

Make agent-produced React and TypeScript changes predictable and reviewable
through repository rules, automated checks, and recorded responsibility.

## Status

Every rule below is a **target**. Each names the check planned to enforce it.
When a check lands, its row moves to **enforced** in the same PR. Until then,
the current gates are the ones listed in
[`.agents/project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md).

| Area | Status | Planned enforcer |
| --- | --- | --- |
| React rules | target | `react/no-multi-comp`, React hooks and compiler lint rules, restricted syntax |
| Structure and abstraction | target | Restricted imports, Fallow boundaries, custom route-boundary and task-file checks |
| Callback naming | target | `react/jsx-handler-names` plus a custom TypeScript-aware naming check |
| Local hooks and CI | target | Husky pre-commit and pre-push parity with required CI checks |
| Enforcement change approval | target | Trusted-baseline detection workflow, sticky PR comment, checkbox approval check |
| Accountability | target | Approval audit record linked to the PR |

## React rules

- One React component per file. This includes components that are not exported.
- Keep rendering pure. Do not mutate props or state.
- Calculate derived values during rendering instead of storing and
  synchronizing them through effects.
- Use TanStack Query for server state, React Hook Form for form state, and
  `useState` or reducers for local UI state.
- Keep effects inside named integration hooks. State and effects used together
  belong in a custom hook. Reuse existing hooks where they already provide the
  behaviour.
- Ban loop statements in application code.

## Structure and abstraction

- Compose pages from existing global primitives.
- Keep domain-specific components within their domain.
- Colocate page-specific components, hooks, supporting logic, and tests by
  route. In this template a route maps to a feature folder under
  `src/features/<feature-name>/`.
- Import another route's code only through its public entry point.
- Keep single-use presentation inline by default. Creating new component files
  must be allowed by the task.

## Callback naming

Named functions declared inside components use the `handle` prefix. Callback
props use the `on` prefix.

For example, a parent defines `handleSave` and passes it as the child's
`onSave` callback. Forwarded callback props may retain their `on` names.

## Executable checks

- Use `react/no-multi-comp` with `ignoreStateless: false` for one component per
  file.
- Use `react/jsx-handler-names` with `handle` and `on` prefixes. Enable local
  variable and inline function checks.
- Use React's lint rules for immutability, render purity, hook order and
  dependencies, and unnecessary synchronous state updates in effects.
- Use restricted syntax and imports, plus custom TypeScript-aware checks for the
  remaining component-local naming, callback prop, route boundary, and task
  file rules.

Treat violations as errors. Diagnostics must explain the required correction.

## Local hooks and CI

Pre-commit and pre-push hooks run the policy checks and type checking.

Required CI checks run independently against the proposed code, including lint,
type checking, and relevant behaviour tests. CI stays required whether or not a
local hook ran.

Agents keep hooks, violations, and checks intact while making their feature
pass: hooks run, violations are fixed at the source, and checks keep their
strength. Enforcement changes follow the approval process below.

## Enforcement change approval

CI detects changes to lint configuration, custom rules, hook scripts, check
commands, file exclusions, and enforcement workflows. The detection check runs
from a trusted baseline so edits to the check itself are also reported.

When no enforcement files change, the enforcement approval check passes
automatically.

When enforcement files change, CI creates or updates one PR comment listing the
exact changes and their effect. The comment contains this approval checkbox:

- [ ] I have reviewed and approve the enforcement changes listed above. This
  checkbox must be checked by a human. Agents must not check or modify it.

A workflow responds to the checkbox edit, records the approving account,
timestamp, and exact enforcement diff, and updates the required approval check
for the current PR commit. Approval comes from the checkbox; a formal maintainer
review is optional.

When the enforcement diff changes again, the checkbox resets and fresh approval
is required. Unchecking the box revokes approval.

This approval clears only the enforcement change approval requirement. All
other required checks must still pass.

## Accountability

The account holder owns the approval and is responsible for actions performed
through their account, including actions performed by their agent. One account
per person is enough; separate agent accounts are optional.

If an agent checks the box despite the explicit instruction, CI may accept the
recorded action, and the account holder remains responsible for the policy
breach.

Keep the original detection, enforcement diff, and approval history linked to
the PR and, where available, the agent run. The team can use that record to
assess both the approval and the agent's conduct.
