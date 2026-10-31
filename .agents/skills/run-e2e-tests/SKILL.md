---
name: run-e2e-tests
description: Map a user-visible behaviour to a Playwright end-to-end test and run it against the real app. Use when adding or changing behaviour, when asked to write/extend the E2E behaviour map, or to verify the app's behaviour end-to-end in this repository.
---

# Run E2E tests

The **behaviour map** specifies the product's user-visible contract before new
behaviour is built ([`.agents/decisions/0003-behaviour-mapped-with-e2e.md`](../../../.agents/decisions/0003-behaviour-mapped-with-e2e.md)).
Use it for behaviour changes, requests to run E2E or verify a flow, and the
post-feature check before Done.

## Process

1. Read `<result>/web/e2e/*.spec.ts`. The reference journeys are in
   `apps/web/e2e/greeting.spec.ts`; the axe scan is in
   `apps/web/e2e/accessibility.spec.ts`. Read `.agents/project/ARCHITECTURE.md`
   for where behaviour belongs.
2. Copy `.agents/templates/e2e-flow.spec.ts.template` to
   `<result>/web/e2e/<route-name>.spec.ts`. Put one `test` per distinct journey
   inside a route-named `test.describe`. Add an axe scan of new states to the
   result's `accessibility.spec.ts`.
   Import `test`, `expect` and `Page` from `./fixtures`; copy the reference's
   `fixtures.ts` into a new result's E2E folder. Its automatic guard fails on
   page console warnings, console errors and uncaught errors. For a deliberate
   error, declare its message with `expectConsole(/message/)` inside that test,
   or `test.use({ expectedConsole: [/message/] })` within its describe block.
   Each expected pattern must appear; fix unexpected messages at their cause.
3. Drive the UI through the accessibility tree, preferably `getByRole(role, { name })`.
   Assert what the user sees; leave CSS classes and internal state to unit tests.
4. Assert outcomes with `expect(locator).toHaveText(...)`, `toBeVisible()`,
   the live `status` region, etc.
5. Exercise the result's real api through Vite's `/trpc` proxy. Wait for the
   procedure response (`page.waitForResponse` on `/trpc/<router>.<procedure>`),
   prove server validation with the `request` fixture, and prove the error
   state with `page.route('**/trpc/**', ...)`. Follow `apps/web/e2e/greeting.spec.ts`.
6. Update an existing feature PRD in `docs/prd/` in the same change, with each
   behaviour's `- Proved by [<test title>](<path to the spec>)` link. Renamed,
   skipped, or commented-out tests fail `pnpm check:docs` until the PRD links
   to a running test ([ADR 0045](../../../.agents/decisions/0045-prds-state-intent-and-link-their-specs.md)).

## Commands

```bash
pnpm e2e            # playwright test: every spec in each result's web/e2e/
pnpm e2e:install    # one-time: install the Chromium browser
pnpm exec playwright test --project reference                      # only the apps/ result
pnpm exec playwright test apps/web/e2e/greeting.spec.ts --headed   # watch one spec run
pnpm exec playwright show-report                                   # open the last HTML report
```

`playwright.config.ts` reads `tooling/results.mjs`: each result gets a Chromium
project (`reference` for `apps/`, the id for `showcase/<id>/`) and two servers,
Node api and Vite web. The reference uses ports 5173 and 3001; each further
result adds 10. New results and specs join without config changes.
Set `E2E_BASE_URL` to use your own reference web server, such as `pnpm preview` on :3000.

## Done when

`pnpm e2e` passes and covers the new behaviour. Follow
[`.agents/project/PR_QUALITY.md`](../../../.agents/project/PR_QUALITY.md).
