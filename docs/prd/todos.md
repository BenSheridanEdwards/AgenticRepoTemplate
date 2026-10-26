# Todos

- **Result:** the reference result, `apps/`
- **Decision:** [ADR 0032](../../.agents/decisions/0032-api-ui-greeting-and-contract.md)
- **Covers:** `apps/web/src/routes/todos/**`, `apps/api/src/features/todos/**`

## Intent

A visitor manages a short task list with a title, completion flag and id per
todo. The api owns in-memory storage for its process lifetime. The route owns
its components, query hooks, form and validation. Follow the existing state
and layering conventions without adding dependencies or shared abstractions.

## Behaviours

- **Manages todos through the api.** Create a trimmed title, list todos, toggle
  completion in either direction and delete. Reloading preserves the list while
  the api runs. Controls expose their titles and pass WCAG 2.1 A/AA axe checks.
  - Proved by [creates, lists, toggles, reloads and deletes todos through /trpc](../../apps/web/e2e/todos.spec.ts)
- **Requires a title.** Blank input adds nothing, sends no create request and
  shows an accessible validation alert.
  - Proved by [blank titles show an accessible alert without creating a todo](../../apps/web/e2e/todos.spec.ts)
- **Validates at the api boundary.** A direct blank-title request is rejected.
  - Proved by [the api rejects a blank title](../../apps/web/e2e/todos.spec.ts)
- **Reports loading failures.** A failed list request shows an alert.
  - Proved by [says so when the list request fails](../../apps/web/e2e/todos.spec.ts)
