# Recent greetings

- **Result:** the reference result, `apps/`
- **Decision:** [A second api feature proves feature isolation on the real tree](../../.agents/decisions/0106-a-second-api-feature-proves-feature-isolation-on-the-real-tree.md)
- **Covers:** `apps/api/src/features/recent-greetings/**`

## Intent

API clients can record greeted names and read the ten most recent names.
The list lives in memory and empties when the api restarts. This second api
feature gives the template a working storage integration and proves that
features stay isolated. The web route follows in a separate change.

## Behaviours

- **Records each greeted name.** Calling `recentGreetings.record` with
  `  Lin  ` stores `Lin`.
  - Proved by [records each greeted name with surrounding whitespace trimmed](../../apps/web/e2e/recent-greetings.spec.ts)
- **Lists the newest name first, at most ten.** Calling `recentGreetings.list`
  returns names in reverse recording order, retaining duplicates.
  - Proved by [lists the newest name first and keeps at most ten names](../../apps/web/e2e/recent-greetings.spec.ts)
- **The api rejects a blank name.** A blank name gets `400` with `BAD_REQUEST`.
  - Proved by [rejects a blank recent greeting name as a bad request](../../apps/web/e2e/recent-greetings.spec.ts)
