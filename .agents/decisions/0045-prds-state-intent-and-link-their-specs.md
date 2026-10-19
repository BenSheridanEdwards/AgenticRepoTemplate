# 45. PRDs state intent and link the specs that prove it

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-19
- **Builds on:** [0003](0003-behaviour-mapped-with-e2e.md), [0021](0021-guidance-docs-state-the-action.md)

## Context

ADR 0003 makes each result's E2E specs the behaviour contract. A spec says
what the product does. It does not say who a feature is for or why it exists,
so a reviewer or an agent has no written intent to judge a change against.
Issue #68 asks for committed PRDs and a check that fails when a PRD and the
code disagree.

A PRD written as free prose drifts the same way any doc does: a test is
renamed or deleted, and the PRD still promises the behaviour it proved.
Nothing fails, so nobody notices.

## Decision

- Each feature has one PRD at `docs/prd/<feature>.md`, copied from
  `.agents/templates/prd.md.template`. The first is
  [`docs/prd/greeting.md`](../../docs/prd/greeting.md), for the greeting in
  the reference result.
- A PRD has an `## Intent` section and a `## Behaviours` section. Each
  top-level list item under `## Behaviours` is one behaviour. Each behaviour
  has one or more nested items of the form
  `- Proved by [<test title>](<path to the spec>)`, with the path relative to
  the PRD.
- The specs stay the contract. The PRD states intent and points at the tests;
  it repeats no assertion. When a behaviour changes, its E2E test changes
  first, and the PRD follows.
- `scripts/check-prd-conflicts.mjs` fails on a conflict between a PRD and the
  behaviour map:
  - a PRD that lists no behaviours;
  - a behaviour with no `Proved by` link;
  - a link to a file that is not a tracked `**/web/e2e/**/*.spec.ts` spec;
  - a link to a title that no `test('<title>', ...)` call in that spec has.
    A `test.skip` or `test.fixme` proves nothing, so it does not count.
- The check runs in `pnpm check:docs`, beside the doc phrasing and sign-off
  docs checks. `pnpm verify`, the pre-push hook and the CI `quality` job
  already run `pnpm check:docs`, so neither the workflows nor the
  required-gates inventory change.

### Alternatives considered

- **The PRD as free prose that a person reviews.** It has no check, so it
  drifts with no signal.
- **The PRD as the contract, with specs generated from it.** It moves the
  contract away from ADR 0003 and puts a translation step between intent and
  the test that runs.
- **A link by Playwright's full title, `Greeting › greets a name through the
  api`.** Matching the `test(...)` title alone is enough to find the test, and
  a `describe` rename then leaves every PRD valid.

## Consequences

- Renaming or deleting an E2E test that a PRD links fails `pnpm check:docs`
  until the PRD names the test that proves the behaviour now.
- A new behaviour in a PRD needs its E2E test in the same change, which keeps
  "add behaviour to the E2E map first" from ADR 0003.
- The check reads titles as string literals. A title built from a template
  expression or a variable does not match, so a linked test uses a literal
  title.
- The check sees whether each behaviour has a test, and leaves whether the
  test matches the prose to the reviewer.
- Possible follow-ups, each needing its own decision: a "PRD impact" section
  in the PR body for changes to a feature's code or specs, PRDs for the
  showcase Todo results, and sign-off for a change that contradicts a PRD.
