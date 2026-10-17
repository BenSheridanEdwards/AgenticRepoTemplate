# Definition of Done

A change is **done** when every box below is true. This is not aspirational —
the quality gates mechanically enforce most of it, so "done" and "passes the
gates" are the same statement. A task is not done until the changed behaviour is
verified by deterministic evidence: tests, build output, typecheck and lint
results, screenshots or video for user-visible behaviour, or another concrete
artifact that stands without anyone's judgment. An agent reports a task
complete once `pnpm verify` and `pnpm e2e` are green.

## The checklist

- [ ] **Behaviour is specified.** New or changed behaviour is covered by
      `e2e/app.spec.ts` (the behaviour map). The product's contract is explicit.
- [ ] **Logic is unit-tested.** Pure functions and hooks have tests that assert
      behaviour through the public surface — coverage stays at/above the
      threshold in `jest.config.ts` (80%).
- [ ] **Types check.** `pnpm typecheck` passes with no `any` and no weakened
      config.
- [ ] **Lint + format clean.** `pnpm check` (Biome), `pnpm lint:policy`
      (ESLint), and `pnpm react-doctor` pass; every disabled rule carries a
      written reason.
- [ ] **Code intelligence clean.** `pnpm fallow:audit` introduces no new dead
      code, circular dependencies, or complexity/architecture violations.
- [ ] **Architecture checks pass.** `pnpm arch:check` passes: no forbidden
      import, `docs/architecture/roles.mmd` matches `pnpm arch:diagram`, and
      every `etc/*.api.md` matches the code (`pnpm api:report` after an
      intended export change).
- [ ] **Build succeeds.** `pnpm build` produces a clean production bundle.
- [ ] **Accessible.** No axe violations (jest-axe in unit tests, `@axe-core/playwright`
      in the E2E run); interactive elements are reachable and labelled.
- [ ] **Within budget.** `pnpm size` passes (the bundle stays under the
      `.size-limit.json` budget).
- [ ] **PR proof is ready.** The pull request body follows
      [`PR_QUALITY.md`](PR_QUALITY.md) and the
      [pull request template](../../.github/pull_request_template.md), with exact
      local commands, visual proof or `Not applicable` with a reason, CI status,
      risk, rollback, and no private details.
- [ ] **Patterns followed.** The change matches
      [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONVENTIONS.md`](CONVENTIONS.md);
      new files were created from [`../templates/`](../templates).
- [ ] **Decisions recorded.** Any new architectural choice is captured as an ADR
      in [`../decisions/`](../decisions). `pnpm check:adr` fails a change that
      adds a dependency unless an ADR added in the same change names it.
- [ ] **Commit is conventional.** Message follows Conventional Commits.

## The one-command proof

```bash
pnpm verify   # typecheck → biome → fallow → architecture → unit tests → build → size
pnpm e2e      # behaviour map + axe accessibility scan
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
  ([ADR 0027](../decisions/0027-pr-body-names-its-head-commit.md)).

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
  [`.claude/skills/pr-inline-screenshot-proof/SKILL.md`](../../.claude/skills/pr-inline-screenshot-proof/SKILL.md).
- Each evidence link opens the rendered artifact once the branch is pushed.

## Verification

- Format, lint, typecheck, unit, integration, and E2E checks relevant to the
  changed files run after the final code change.
- The PR lists each command and its pass or fail result.
- The PR separates existing unrelated failures from failures it introduces.
- Each skipped check names its reason, risk, and follow-up owner.
