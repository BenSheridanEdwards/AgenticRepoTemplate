# Definition of Done

A change is **done** when every box below is true. This is not aspirational —
the quality gates mechanically enforce most of it, so "done" and "passes the
gates" are the same statement. A task is not done until the changed behaviour is
verified by deterministic evidence: tests, build output, typecheck and lint
results, screenshots or video for user-visible behaviour, or another concrete
artifact that does not depend on anyone's judgment. An agent must not report a
task complete until `pnpm verify` and `pnpm e2e` are green.

## The checklist

- [ ] **Behaviour is specified.** New or changed behaviour is covered by
      `e2e/app.spec.ts` (the behaviour map). The product's contract is explicit.
- [ ] **Logic is unit-tested.** Pure functions and hooks have tests that assert
      behaviour through the public surface — coverage stays at/above the
      threshold in `jest.config.ts` (80%).
- [ ] **Types check.** `pnpm typecheck` passes with no `any` and no weakened
      config.
- [ ] **Lint + format clean.** `pnpm check` (Biome) passes; no disabled rules
      without a written reason.
- [ ] **Code intelligence clean.** `pnpm fallow:audit` introduces no new dead
      code, circular dependencies, or complexity/architecture violations.
- [ ] **Build succeeds.** `pnpm build` produces a clean production bundle.
- [ ] **Accessible.** No axe violations (jest-axe in unit tests, `@axe-core/playwright`
      in the E2E run); interactive elements are reachable and labelled.
- [ ] **Within budget.** `pnpm size` passes (the bundle stays under the
      `.size-limit.json` budget).
- [ ] **Visuals accounted for.** Any CSS change is either an *intended* change
      approved in the StyleProof report, or a refactor certified as zero-diff.
- [ ] **PR proof is ready.** The pull request body follows
      [`PR_QUALITY.md`](PR_QUALITY.md) and the
      [pull request template](../../.github/pull_request_template.md), with exact
      local commands, visual proof or `Not applicable` with a reason, CI status,
      risk, rollback, and no private details.
- [ ] **Patterns followed.** The change matches
      [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONVENTIONS.md`](CONVENTIONS.md);
      new files were created from [`../templates/`](../templates).
- [ ] **Decisions recorded.** Any new architectural choice is captured as an ADR
      in [`../decisions/`](../decisions).
- [ ] **Commit is conventional.** Message follows Conventional Commits.

## The one-command proof

```bash
pnpm verify   # typecheck → biome → fallow → unit tests → build → size
pnpm e2e      # behaviour map + axe accessibility scan
```

If both are green and the checklist holds, the work is done. If either is red,
it is not — regardless of how finished the code looks.

## Required PR body

Before opening or marking a PR ready, complete [`PR_QUALITY.md`](PR_QUALITY.md)
through the GitHub pull request template. The PR body must use
[`.github/pull_request_template.md`](../../.github/pull_request_template.md) and
preserve these sections, in this order:

1. `Why does this feature exist?`
2. `What changed?`
3. `Behavioural Proof (with video and screenshots)`
4. `Verification Summary`

`scripts/validate-pr-body.mjs` (the `pr-quality` CI job) enforces this
structure: each section must be present, in order, and non-empty; the
Behavioural Proof section must contain an inline image (`![`) or the exact string
`Not applicable`; and the PR **title** must be Conventional Commits.

## Required PR title

The PR title must use Conventional Commits format: `type(scope): summary` or
`type: summary`. Agent, tool, author, or source prefixes such as `[codex]`,
`[claude]`, `[agent]`, or similar tags are not allowed in PR titles.

## Behavioural proof

- User-visible behaviour changes include screenshots from the branch under
  review; flows with motion or timing include video when practical.
- Screenshots and videos must show the changed behaviour, not a generic happy
  path.
- Behaviour/E2E tests map to the user-visible behaviour changed by the PR.
- Every bug fix ships, in the same change, with the test that would have caught
  it — the test fails on the unfixed code and asserts the user-visible symptom.
- Missing visual proof or E2E coverage is allowed only with a technical reason
  and a stated replacement verification method.
- Proof files live under the feature's `docs/proof/<short-scope>/` directory
  unless there is a stated technical reason to use another committed location.
- The PR body must include live, clickable links to every screenshot, video, and
  evidence artifact. GitHub `blob` links to committed proof files are acceptable;
  local paths, relative paths, and plain filenames are not.
- Every live evidence link must be opened or otherwise verified after the branch
  is pushed. If a reviewer cannot click from the PR to the rendered artifact, the
  PR is not ready for review.

## Verification

- Format, lint, typecheck, unit, integration, and E2E checks relevant to the
  changed files are run after the final code change.
- Test command names and pass/fail results are listed in the PR.
- Existing unrelated failures are separated from failures introduced by the PR.
- Any skipped check includes the reason, risk, and owner for follow-up.

## Inline PR Proof Law

Every PR must follow
[`.claude/skills/pr-inline-screenshot-proof/SKILL.md`](../../.claude/skills/pr-inline-screenshot-proof/SKILL.md).

- The PR body must use
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md);
  that template carries this same proof law.
- Screenshot proof must be committed to the branch, normally under
  `docs/proof/<short-scope>/`.
- The PR body must embed screenshots inline with Markdown image syntax:
  `![Descriptive alt text](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)`.
- Bare screenshot links, local filesystem paths, relative paths, and "see
  attached" placeholders do not satisfy proof.
- Video or non-image artifacts may be linked, but screenshots must render inline
  in the PR description.
- After creating or editing the PR, inspect the body with
  `gh pr view <number> --json body --jq .body` and confirm screenshot proof
  contains `![`.
- If no rendered or behavioural proof applies, the PR must say `Not applicable`
  in the proof section with the technical reason.
