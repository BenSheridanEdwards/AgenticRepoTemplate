# Greeting

- **Result:** the reference result, `apps/`
- **Decision:** [ADR 0045](../../.agents/decisions/0045-prds-state-intent-and-link-their-specs.md)
- **Covers:** `apps/web/src/routes/greeting/**`, `apps/api/src/features/greeting/**`

## Intent

A visitor types a name and the page greets them by it. The greeting is the
reference feature: the smallest slice that crosses the web page, the tRPC
contract and the api, so each pattern in the repo has one working example. The
E2E specs linked below are the contract. This page says what the feature is for
and which test proves each promise.

## Behaviours

- **Greets the visitor by name.** The visitor enters a name and selects Greet.
  The api answers, and the page announces `Hello, <name>!` with the spaces
  around the name trimmed.
  - Proved by [greets a name through the api](../../apps/web/e2e/greeting.spec.ts)
- **Asks for a name before it calls the api.** A blank name shows `Enter a
  name`, marks the field invalid, and sends the api no request.
  - Proved by [asks for a name and sends no request when the name is blank](../../apps/web/e2e/greeting.spec.ts)
- **The api rejects a blank name.** A direct call with a blank name gets a
  `400` with the `BAD_REQUEST` code, so the rule holds for every client.
  - Proved by [the api rejects a blank name as a bad request](../../apps/web/e2e/greeting.spec.ts)
- **Says so when the api fails.** A failed call shows `Could not load the
  greeting`.
  - Proved by [says so when the api fails](../../apps/web/e2e/greeting.spec.ts)
- **Works for every visitor.** The empty page, the validation error and the
  greeting each pass the WCAG 2.1 A and AA rules that axe checks in Chromium.
  - Proved by [the greeting page has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
  - Proved by [the validation error state has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
  - Proved by [the greeting result has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
