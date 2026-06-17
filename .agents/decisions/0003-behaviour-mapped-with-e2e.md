# 3. Behaviour is mapped with end-to-end tests

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

To let agents refactor freely without fear, the team needs a contract that says
what the product *does*, independent of *how* it is built. Unit tests, coupled
to implementation, do not provide this — they often must change when the code is
refactored, which is exactly when you least want your safety net to move.

## Decision

The product's externally observable behaviour is specified as an end-to-end
"behaviour map" in `e2e/app.spec.ts`, driven through the real UI with Playwright
and asserted via the accessibility tree (roles, names, live regions). New
behaviour is added here first; the map is the contract.

Unit tests still exist and matter — they cover logic and edge cases cheaply —
but they verify *units*, while the behaviour map verifies *the product*.

## Consequences

- An agent can refactor or rewrite an implementation and trust the behaviour map
  to catch any change in what the product does.
- Tests assert on what a user perceives, so they survive refactors and double as
  living documentation.
- E2E is slower than unit tests, so it runs on pre-push and in CI, not on every
  commit.
- Playwright is also the host for StyleProof, so one browser harness serves both
  behavioural and visual verification.
