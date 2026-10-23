# 45. PRDs state intent and link the specs that prove it

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-19
- **Builds on:** [0003](0003-behaviour-mapped-with-e2e.md), [0021](0021-guidance-docs-state-the-action.md)
- **Extended by:** [0058](0058-prds-name-the-code-they-cover.md), which adds machine-readable code coverage to each PRD.

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
  `.agents/templates/prd.md.template`. Every tracked Markdown file directly
  in `docs/prd/` is a PRD, a `README.md` included. The check reads no
  subfolder and no file that git does not track. The folder listing is the
  index. The first is
  [`docs/prd/greeting.md`](../../docs/prd/greeting.md), for the greeting in
  the reference result.
- A PRD has an `## Intent` section and one `## Behaviours` section. Each
  top-level `- ` item under `## Behaviours` is one behaviour. Each behaviour
  has one or more nested items of the form
  `- Proved by [<test title>](<path to the spec>)`, with the path relative to
  the PRD. The check ignores a `#` anchor on the path, such as `#L12`.
- The specs stay the contract. The PRD states intent and points at the tests;
  it repeats no assertion. When a behaviour changes, its E2E test changes
  first, and the PRD follows.
- `scripts/check-prd-conflicts.mjs` fails on a conflict between a PRD and the
  behaviour map:
  - a PRD that lists no behaviours;
  - a second `## Behaviours` section;
  - a line under `## Behaviours` it cannot read: a top-level item with a
    `+` or number marker, an item indented by one space, a `Proved by` line
    in any other form, or a proof before the first behaviour;
  - a behaviour with no `Proved by` link;
  - a link to a file that is not a tracked `**/web/e2e/**/*.spec.ts` spec
    present in the working tree;
  - a link to a title that no `test('<title>', ...)` call in that spec
    has;
  - a link to a title whose tests in that spec do not run.
- The check parses each linked spec with the TypeScript compiler API, so a
  test in a comment does not count. A test counts unless it is a
  `test.skip`, `test.fixme` or `test.fail`, sits inside a
  `test.describe.skip` or `test.describe.fixme`, has an `annotation` detail
  of type `skip`, `fixme` or `fail` (one object or a list) or sits in a group
  that has one, or sits in a test, group or file that calls `test.skip(...)`,
  `test.fixme(...)` or `test.fail(...)` without a test body, even behind a
  condition. Playwright skips a test by those annotations as it does by the
  methods. `testInfo.skip(...)`,
  `testInfo.fixme(...)` and `testInfo.fail(...)` act the same way, whatever
  the parameter is called, so the check reads every other `.skip`, `.fixme`
  or `.fail` method call like the `test` call of that name. A `test.fail`
  test passes only while its assertions fail, which is when the behaviour is
  broken. A `test.only` runs, so it counts; Playwright's `forbidOnly` fails it
  in CI.
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
- **A regular expression over the spec source.** It counts a test inside a
  comment or a skipped group, and a `.test(...)` call on any object. The
  compiler API is already a dependency and sees the code as Playwright does.
- **Skipping `README.md` in `docs/prd/`.** One exception means a file in the
  folder can hold behaviours that nothing checks.
- **A link by Playwright's full title, `Greeting › greets a name through the
  api`.** Matching the `test(...)` title alone is enough to find the test, and
  a `describe` rename then leaves every PRD valid.

## Consequences

- Renaming or deleting an E2E test that a PRD links fails `pnpm check:docs`
  until the PRD names the test that proves the behaviour now.
- A new behaviour in a PRD needs its E2E test in the same change, which keeps
  "add behaviour to the E2E map first" from ADR 0003.
- The check reads titles as string literals, a backtick string with no
  `${...}` included. A title built from a template expression or a variable
  does not match, so a linked test uses a literal title.
- A conditional skip or fail, such as `test.skip(browserName === 'webkit')`,
  stops the test from counting, since the check cannot tell when it runs. A
  PRD links a test that runs everywhere.
- The check reads `.skip`, `.fixme` and `.fail` written as a property
  access, and `test(...)` calls wherever they sit in the file. A
  `const skip = test.skip` alias, a `test['skip']` call, a destructured
  `skip`, and a `test(...)` in a function that never runs or behind
  `if (false)` still count as a test that runs, so a linked spec calls
  Playwright directly.
- Any `.skip`, `.fixme` or `.fail` method call reads as a skip, such as
  Node's `assert.fail` or a `.fail()` callback inside `page.evaluate`, so it
  stops the test, group or file it sits in from counting. A linked spec
  throws or uses `expect` instead. When a linked test exists but does not
  run, the check says so and names these causes.
- A linked spec writes its annotations and test details inline. Details
  passed as a variable, a spread or a computed key, or an annotation type
  that is not a string literal, read as a skip.
- A linked spec writes its test bodies inline and gives each group a title.
  A `test.skip(title, body)` whose body is a function reference, or a
  `test.describe.skip(body)` with no title, reads as a skip without a test
  body, so its sibling tests stop counting. A test inside `test.fail.only` is
  not read as a test. Each fails the check as a false conflict, never a
  silent pass.
- A `- ` line inside a code fence under `## Behaviours` reads as a
  behaviour, so a PRD keeps code examples out of that section.
- The check sees whether each behaviour has a test, and leaves whether the
  test matches the prose to the reviewer.
- Possible follow-ups, each needing its own decision: a "PRD impact" section
  in the PR body for changes to a feature's code or specs, PRDs for the
  showcase Todo results, and sign-off for a change that contradicts a PRD.
