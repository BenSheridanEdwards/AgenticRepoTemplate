# PR quality contract

## Definition of Done

A change is done when every checklist item holds and deterministic evidence verifies the changed behaviour: tests, build output, typecheck and lint results, screenshots or video for user-visible behaviour, or another concrete artifact that stands without anyone's judgment. Report completion once `pnpm verify` and `pnpm e2e` pass.

## The checklist

- [ ] Installs stay stable. `pnpm check:lockfile` passes fresh installation and addition of two showcase importers without unrelated lockfile drift.
- [ ] Behaviour is specified. New or changed behaviour is covered by a spec in the result's `web/e2e/` folder (the behaviour map), such as `apps/web/e2e/greeting.spec.ts`. The product's contract is explicit.
- [ ] Logic is unit-tested. Domain, application and procedures have `api` Jest tests; hooks and pages have `web` Jest tests that render through `TestApiProvider`. Coverage stays at/above the threshold in `jest.config.ts` (80%).
- [ ] Types check. `pnpm typecheck` passes its four programs, `tsconfig.json` (web and ui), `tsconfig.node.json` (configs and e2e), `tsconfig.api.json` (api) and `tsconfig.domain.json` (api domain, no Node), with no `any` and no weakened config.
- [ ] Lint + format clean. `pnpm check` (Biome), `pnpm lint:policy` (ESLint), `pnpm lint:anti-slop` (Oxlint anti-slop rules), and `pnpm react-doctor` pass; every disabled rule carries a written reason.
- [ ] Changed lines clear of anti-slop findings. `pnpm lint:anti-slop:changed` prints no finding for the committed branch.
- [ ] Code intelligence clean. `pnpm fallow:audit` reports no dead code, circular dependency, complexity, architecture or `contract/<id>` finding in any file the change touches.
- [ ] Architecture checks pass. `pnpm arch:check` passes: every file sits in a role, no forbidden import, every result passes the structure check, `docs/architecture/roles.mmd` and each result's `architecture.mmd` match `pnpm arch:diagram`, and every package's `etc/*.api.md` matches the code (`pnpm api:report` after an intended export change).
- [ ] Build succeeds. `pnpm build` produces a clean production bundle.
- [ ] Accessible. No axe violations (jest-axe in unit tests, `@axe-core/playwright` in the E2E run); interactive elements are reachable and labelled.
- [ ] Within budget. `pnpm size` passes (the bundle stays under the `package.json` `size-limit` budget).
- [ ] PR proof is ready. The pull request body follows [the proof rules](#required-proof) and the [pull request template](../../.github/pull_request_template.md), with exact local commands, visual proof or `Not applicable` with a reason, the PRDs and North Star commit checked, PRD impact, risk, rollback, and no private details.
- [ ] Patterns followed. The change matches [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONVENTIONS.md`](CONVENTIONS.md); new files were created from [`../templates/`](../templates).
- [ ] Decisions recorded. Any new architectural choice is captured as an ADR in [`../decisions/`](../decisions). `pnpm check:adr` fails a change that adds a dependency unless an ADR added in the same change names it.
- [ ] Commit is conventional. Message follows Conventional Commits.

## The one-command proof

```bash
pnpm verify   # typecheck → biome → eslint → fallow → architecture → unit tests → build → size
pnpm e2e      # every result's behaviour map + axe accessibility scan
```

Both commands must pass and the checklist must hold before the work is done.

## Required proof

Use [the PR template](../../.github/pull_request_template.md) for every PR. Explain why the change exists and provide proof that separates local results, GitHub Actions results on the latest commit, browser or deployed-runtime verification, and unverified gaps. State each separately.

Every body includes why (problem, risk, or capability), what changed (the smallest reviewable summary), local verification (exact commands and pass/fail results), intent checked (PRDs, North Star commit, and PRD impact), visual proof or `Not applicable` with a reason, risk and rollback (blast radius and how to back out), and the [checklist](#the-checklist) satisfied or each gap named.

## Ready means reviewable

Before review, give a non-trivial PR the smallest view that explains its changed behaviour or structure. Use `/show-me` when available: choose a control-flow sketch, component tree, state transition, sequence, or focused before-and-after diff. Keep trivial changes diagram-free.
Every label must trace to real files, symbols, states, or evidence. Show warnings and uncertainty. The view supplements behavioural tests, screenshots, command output, and exact-head CI.
Report completion once the latest-sha checks are green. The checks panel, not the body, carries CI status.

## Evidence rules

- Name commands: `pnpm verify`, rather than "tests passed". Run relevant format, lint, typecheck, unit, integration, and E2E checks after the final code change; list each command and its pass/fail result.
- UI-visible or CSS changes need screenshots or video. For docs-only or config-only changes, write `Not applicable` with a reason and deterministic proof such as lint, build, or workflow validation.
- Keep failures visible and fix their cause with every hook, gate, and check in place. Separate existing unrelated failures from introduced failures. Each skipped check names its reason, risk, and follow-up owner.
- Verify a deploy or external service directly before claiming it works there.
- Keep private project details, secrets, tokens, and customer names out of public bodies. Use repo-relative paths, placeholders such as `<workdir>/repo` or `<tmp>/verify.log`, links, and commands. The validator rejects machine-local paths, including in code spans, fenced blocks, and HTML comments ([ADR 0051](../decisions/0051-pr-body-names-no-machine-local-path.md)).

## PR body source

The [template](../../.github/pull_request_template.md) is the review-facing version of this contract. The `PR quality` workflow checks structure, proof format, title, and branch name through [the validator](../../scripts/validate-pr-body.mjs) on every PR event, including body edits. It names the fix when a check fails.

## PR contract checks

- Keep four template sections in order, each with real content: `Why does this feature exist?`, `What changed?`, `Behavioural Proof (with video and screenshots)`, and `Verification Summary`.
- Embed screenshots inline as `![alt](url)` in the proof section, rather than linking to them, or write `Not applicable` with the technical reason on the same or next line. Every inline image uses an absolute `https://` URL; GitHub blob URLs end in `?raw=1` so they render.
- Use a Conventional Commits title, `type(scope): summary`, without an agent or tool prefix, and a `<type>/<short-kebab-summary>` head branch.
- Include exactly one `- Head commit:` line in Verification Summary, naming one full or short SHA of the PR head. Re-check the whole body and update this line after each push; a moved head fails until rechecked ([ADR 0029](../decisions/0029-pr-body-names-its-head-commit.md)).
- Include exactly one `- PRDs checked:` line there: comma-separated Markdown paths tracked directly in `docs/prd/` at the head, or `None: <reason>` with at least two words.
- Include exactly one `- PRD impact:` line there: `None`, or `No behaviour change: <reason>` with at least two words. List every PRD whose `Covers` globs or linked specs match a changed path in `PRDs checked`; update it in the same PR or explain unchanged behaviour. `None` passes when all affected PRDs change or no paths are covered. Both paths of a rename count; local validation compares `origin/main...HEAD` ([ADR 0066](../decisions/0066-prd-impact-in-the-pr-body.md)).
- Include exactly one `- North Star commit:` line there: one SHA of 7–40 hex characters, optionally in balanced backticks, matching a prefix of the last commit to change `docs/NORTH_STAR.md` at the PR head. Read it with `git log -1 --format=%H <head> -- docs/NORTH_STAR.md`.

The workflow checks these references at the PR head ([ADR 0057](../decisions/0057-pr-body-names-its-prds-and-north-star-commit.md)). Review checks that the PRDs and stated outcome fit the change. Re-check these fields after every push along with the head commit.

## Proof judgment

Reviewers check these requirements:

- Screenshots and video come from the branch under review and show the changed behaviour itself. Include video for motion or timing when practical.
- E2E tests map to the user-visible behaviour the PR changes.
- Every bug fix ships, in the same change, with a regression test that fails on the unfixed code and asserts the user-visible symptom.
- Missing visual proof or E2E coverage has a technical reason and a replacement verification method.
- Commit proof on the PR branch under `docs/proof/<short-scope>/`, unless the PR gives a technical reason for another committed location. Embed screenshot proof inline as the [PR quality skill](../../.agents/skills/pr-quality-contract/SKILL.md) describes.
- Each evidence link opens the rendered artifact once the branch is pushed.

## Verification

Run the checks and report results and gaps as required by [Evidence rules](#evidence-rules).

## Proposing a PRD change

Use the [PRD change issue form](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/issues/new?template=prd-change.yml) for behaviour or intent changes. Name the conflicting or superseded `docs/prd/<feature>.md`, or write `None: new PRD for <feature>`. Link the branch compare or draft PR editing it, explain the North Star outcome, and list E2E tests that would change when known.
GitHub requires PRD, proposed diff, and outcome answers. `scripts/issue-forms.test.ts`, run by `pnpm test` and `pnpm verify`, protects these requirements and keeps blank issues available. Review checks that path, diff, and outcome match the proposal ([ADR 0056](../decisions/0056-prd-changes-start-from-an-issue-form.md)).

## PR size

Keep each stacked migration piece at or under 400 changed lines. A self-contained single-idea PR may exceed 400 when its body explains in one sentence why it is one idea. Keep the existing counting rules ([ADR 0074](../decisions/0074-the-400-line-pr-limit-applies-to-stacked-migration-prs.md)).
