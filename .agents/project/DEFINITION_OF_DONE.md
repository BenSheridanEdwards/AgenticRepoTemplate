# Definition of Done

A change is **done** when every box below is true. This is not aspirational —
the quality gates mechanically enforce most of it, so "done" and "passes the
gates" are the same statement. A task is not done until the changed behaviour is
verified by deterministic evidence: tests, build output, typecheck and lint
results, screenshots or video for user-visible behaviour, or another concrete
artifact that stands without anyone's judgment. An agent reports a task
complete once `pnpm verify` and `pnpm e2e` are green.

## The checklist

- [ ] **Installs stay stable.** `pnpm check:lockfile` passes fresh installation and addition of two showcase importers without unrelated lockfile drift.
- [ ] **Behaviour is specified.** New or changed behaviour is covered by a
      spec in the result's `web/e2e/` folder (the behaviour map), such as
      `apps/web/e2e/greeting.spec.ts`. The product's contract is explicit.
- [ ] **Logic is unit-tested.** Domain, application and procedures have `api`
      Jest tests; hooks and pages have `web` Jest tests that render through
      `TestApiProvider`. Coverage stays at/above the threshold in
      `jest.config.ts` (80%).
- [ ] **Types check.** `pnpm typecheck` passes its four programs,
      `tsconfig.json` (web and ui), `tsconfig.node.json` (configs and e2e),
      `tsconfig.api.json` (api) and `tsconfig.domain.json` (api domain, no
      Node), with no `any` and no weakened config.
- [ ] **Lint + format clean.** `pnpm check` (Biome), `pnpm lint:policy`
      (ESLint), `pnpm lint:anti-slop` (Oxlint anti-slop rules), and
      `pnpm react-doctor` pass; every disabled rule carries a written reason.
- [ ] **Changed lines clear of anti-slop findings.**
      `pnpm lint:anti-slop:changed` prints no finding for the committed branch.
- [ ] **Code intelligence clean.** `pnpm fallow:audit` reports no dead code,
      circular dependency, complexity, architecture or `contract/<id>` finding
      in any file the change touches.
- [ ] **Architecture checks pass.** `pnpm arch:check` passes: every file sits
      in a role, no forbidden import, every result passes the structure check,
      `docs/architecture/roles.mmd` and each result's `architecture.mmd` match
      `pnpm arch:diagram`, and every package's `etc/*.api.md` matches the code
      (`pnpm api:report` after an intended export change).
- [ ] **Build succeeds.** `pnpm build` produces a clean production bundle.
- [ ] **Accessible.** No axe violations (jest-axe in unit tests, `@axe-core/playwright`
      in the E2E run); interactive elements are reachable and labelled.
- [ ] **Within budget.** `pnpm size` passes (the bundle stays under the
      `.size-limit.json` budget).
- [ ] **PR proof is ready.** The pull request body follows
      [`PR_QUALITY.md`](PR_QUALITY.md) and the
      [pull request template](../../.github/pull_request_template.md), with exact
      local commands, visual proof or `Not applicable` with a reason, CI status,
      the PRDs and North Star commit checked, PRD impact, risk, rollback, and
      no private details.
- [ ] **Patterns followed.** The change matches
      [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONVENTIONS.md`](CONVENTIONS.md);
      new files were created from [`../templates/`](../templates).
- [ ] **Decisions recorded.** Any new architectural choice is captured as an ADR
      in [`../decisions/`](../decisions). `pnpm check:adr` fails a change that
      adds a dependency unless an ADR added in the same change names it.
- [ ] **Commit is conventional.** Message follows Conventional Commits.

## The one-command proof

```bash
pnpm verify   # typecheck → biome → eslint → fallow → architecture → unit tests → build → size
pnpm e2e      # every result's behaviour map + axe accessibility scan
```

If both are green and the checklist holds, the work is done. If either is red,
it is not — regardless of how finished the code looks.

## PR contract checks

The `PR quality` workflow runs
[`scripts/validate-pr-body.mjs`](../../scripts/validate-pr-body.mjs) on every
pull request event, including edits to the body. It fails the PR with a message
that names the fix unless:

- the body keeps the four [template](../../.github/pull_request_template.md)
  sections in order, each with real content: `Why does this feature exist?`,
  `What changed?`, `Behavioural Proof (with video and screenshots)`, and
  `Verification Summary`;
- the proof section embeds a screenshot inline with `![alt](url)`, or says
  `Not applicable` followed by the technical reason on the same line or the
  next one;
- every inline image is an absolute `https://` URL, and a GitHub blob URL ends
  in `?raw=1`, so the image renders;
- the proof section embeds its images instead of linking to them;
- the title is Conventional Commits, `type(scope): summary`, with no agent or
  tool prefix;
- the head branch is `<type>/<short-kebab-summary>`;
- the Verification Summary has exactly one `- Head commit:` line naming one SHA
  (full or short) of the PR head, so a push that moves the head fails until the
  body is re-checked against it
  ([ADR 0029](../decisions/0029-pr-body-names-its-head-commit.md));
- the Verification Summary has exactly one `- PRDs checked:` line listing
  comma-separated Markdown paths tracked directly in `docs/prd/` at the PR
  head, or `None: <reason>` with a reason of at least two words;
- the Verification Summary has exactly one `- PRD impact:` line containing
  `None`, or `No behaviour change: <reason>` with a reason of at least two
  words; every PRD covering a changed path through its `Covers` globs or
  linked specs is listed in `PRDs checked` and either changes in the PR or
  has that explanation. Both paths of a rename count, and local validation
  compares `origin/main...HEAD` ([ADR 0066](../decisions/0066-prd-impact-in-the-pr-body.md));
- the Verification Summary has exactly one `- North Star commit:` line naming
  one SHA of 7-40 hex characters, optionally in balanced backticks, that is a
  prefix of the last commit to change `.agents/NORTH_STAR.md` at the PR head
  ([ADR 0057](../decisions/0057-pr-body-names-its-prds-and-north-star-commit.md));
- the body names no machine-local path: it cites repo-relative paths,
  placeholders such as `<workdir>/repo` or `<tmp>/verify.log`, links, and commands,
  and the check reads code spans, fenced blocks, and HTML comments too
  ([ADR 0051](../decisions/0051-pr-body-names-no-machine-local-path.md)).

## Proof judgment

These calls need a reviewer:

- Screenshots and video come from the branch under review and show the changed
  behaviour itself. Flows with motion or timing include video when practical.
- E2E tests map to the user-visible behaviour the PR changes.
- Every bug fix ships, in the same change, with the test that would have caught
  it. The test fails on the unfixed code and asserts the user-visible symptom.
- Missing visual proof or E2E coverage comes with a technical reason and the
  replacement verification method.
- Proof files live under `docs/proof/<short-scope>/` on the PR branch, unless
  the PR states a technical reason for another committed location. See
  [`.claude/skills/pr-quality-contract/SKILL.md`](../../.claude/skills/pr-quality-contract/SKILL.md).
- Each evidence link opens the rendered artifact once the branch is pushed.

## Verification

- Format, lint, typecheck, unit, integration, and E2E checks relevant to the
  changed files run after the final code change.
- The PR lists each command and its pass or fail result.
- The PR separates existing unrelated failures from failures it introduces.
- Each skipped check names its reason, risk, and follow-up owner.
