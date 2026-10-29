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

1. **Read the contract first.** Each result keeps its behaviour map in
   `<result>/web/e2e/*.spec.ts`. For the reference result, open
   `apps/web/e2e/greeting.spec.ts` (the greeting journeys) and
   `apps/web/e2e/accessibility.spec.ts` (the axe scan). Read
   `.agents/project/ARCHITECTURE.md` for where behaviour belongs.
2. **Write from the template.** Copy
   `.agents/templates/e2e-flow.spec.ts.template` to
   `<result>/web/e2e/<route-name>.spec.ts`. Add a `test` per distinct user
   journey inside a `test.describe` named for the route. Add an axe scan of the
   new states to the result's `accessibility.spec.ts`.
3. **Drive the UI like a user.** Prefer `getByRole(role, { name })` and the
   accessibility tree. Leave CSS classes and internal state to the unit suite;
   the behaviour map asserts what a user sees.
4. **Assert the user-visible outcome.** Use `expect(locator).toHaveText(...)`,
   `toBeVisible()`, the live `status` region, etc.
5. **Exercise the real api.** The spec runs against the result's api process
   through the Vite `/trpc` proxy. Wait on the procedure's response
   (`page.waitForResponse` on `/trpc/<router>.<procedure>`), call a procedure
   directly with the `request` fixture to prove server validation, and use
   `page.route('**/trpc/**', ...)` to prove the error state, as
   `apps/web/e2e/greeting.spec.ts` does.
6. **Keep the PRD in step.** When the feature has a PRD in `docs/prd/`, add or
   update the behaviour and its `- Proved by [<test title>](<path to the spec>)`
   link in the same change. A renamed, skipped or commented-out test fails
   `pnpm check:docs` until the PRD names a test that runs ([ADR 0045](../../../.agents/decisions/0045-prds-state-intent-and-link-their-specs.md)).

## Commands

```bash
pnpm e2e            # playwright test: every spec in each result's web/e2e/
pnpm e2e:install    # one-time: install the Chromium browser
pnpm exec playwright test --project reference                      # only the apps/ result
pnpm exec playwright test apps/web/e2e/greeting.spec.ts --headed   # watch one spec run
pnpm exec playwright show-report                                   # open the last HTML report
```

`playwright.config.ts` reads the results from `tooling/results.mjs` and gives
each one a Chromium project named by its id (`reference` for `apps/`, the id
for `showcase/<id>/`) and two servers: its api on Node and its web app on Vite.
The reference uses ports 5173 and 3001; each further result adds 10. A new
result and a new spec join the run with no config change. Set
`E2E_BASE_URL` to point the reference project at a web server you run
yourself, such as `pnpm preview` on :3000.

## Done when

`pnpm e2e` is green and the new behaviour is covered. Cross-check
`.agents/project/PR_QUALITY.md`.
