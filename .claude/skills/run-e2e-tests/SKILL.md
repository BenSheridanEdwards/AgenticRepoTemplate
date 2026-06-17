---
name: run-e2e-tests
description: Map a user-visible behaviour to a Playwright end-to-end test and run it against the real app. Use when adding or changing behaviour, when asked to write/extend the E2E behaviour map, or to verify the app's behaviour end-to-end in this repository.
---

# Run E2E tests

End-to-end tests in this repo are the **behaviour map** — the contract of what
the product does, from the user's point of view
(see `.agents/decisions/0003-behaviour-mapped-with-e2e.md`). New behaviour is
specified here first.

## When to use this skill

- You are adding or changing user-visible behaviour.
- You are asked to "run the E2E tests", "verify the flow", or "map the behaviour".
- You finished a feature and need the behaviour map green before Done.

## Process

1. **Read the contract first.** Open `e2e/app.spec.ts` to see existing
   behaviour, and `.agents/project/ARCHITECTURE.md` for where behaviour belongs.
2. **Write from the template.** Copy
   `.agents/templates/e2e-flow.spec.ts.template`. Add a `test` per distinct user
   journey inside a `test.describe` named for the feature.
3. **Drive the UI like a user.** Prefer `getByRole(role, { name })` and the
   accessibility tree. Do not assert on CSS classes or internal state — that is
   StyleProof's and the unit suite's job, not the behaviour map's.
4. **Assert the user-visible outcome.** Use `expect(locator).toHaveText(...)`,
   `toBeVisible()`, the live `status` region, etc.
5. **If the feature adds a new visual state**, add a StyleProof surface from
   `.agents/templates/styleproof-surface.ts.template` to `e2e/styleproof.spec.ts`.

## Commands

```bash
pnpm e2e            # run the behaviour map (Playwright boots the dev server)
pnpm e2e:install    # one-time: install the Chromium browser
pnpm exec playwright test e2e/app.spec.ts --headed   # watch it run
pnpm exec playwright show-report                     # open the last HTML report
```

## Done when

`pnpm e2e` is green and the new behaviour is covered. Cross-check
`.agents/project/DEFINITION_OF_DONE.md`.
