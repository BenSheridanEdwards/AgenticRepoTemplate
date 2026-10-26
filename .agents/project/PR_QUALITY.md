# PR Quality Contract

A pull request is ready for review only when it explains the change and proves
the change. The proof must be specific enough that a reviewer can separate:

- what passed locally;
- what GitHub Actions proved on the latest commit;
- what was verified in a browser or deployed runtime;
- what remains unverified.

State each one separately, in place of a single "all good" statement.

## Proposing a PRD change

Use the [PRD change issue form](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/issues/new?template=prd-change.yml)
to propose a behaviour or intent change. Name the conflicting or superseded
`docs/prd/<feature>.md`, or write `None: new PRD for <feature>`, link the branch
compare or draft PR that edits the PRD, and explain the North Star outcome it
advances. List the E2E tests that would change when known.

GitHub requires answers to the PRD, proposed diff, and outcome fields when
submitting this form. `scripts/issue-forms.test.ts`, run by `pnpm test` and
`pnpm verify`, protects those requirements and keeps blank issues available.
Review checks that the path, diff, and outcome match the proposal
([ADR 0056](../decisions/0056-prd-changes-start-from-an-issue-form.md)).

## PR size

Plan and open each stacked migration piece at or under 400 changed lines.
A self-contained single-idea change may exceed 400 lines when its PR body
explains in one sentence why it is one idea. Keep the existing counting rules
([ADR 0074](../decisions/0074-the-400-line-pr-limit-applies-to-stacked-migration-prs.md)).

## Required proof

Every PR body must include:

- **Why:** the problem, risk, or capability the change exists to address.
- **What changed:** the smallest reviewable summary of the diff.
- **Local verification:** exact commands run, with pass/fail status.
- **Intent checked:** the PRDs and North Star commit checked against the PR
  head, plus the PRD impact statement, recorded in the Verification Summary
  fields below.
- **Visual proof:** screenshots, video, or `Not applicable` with a reason. Any UI-visible
  or CSS change needs visual proof.
- **CI status:** whether checks are green for the latest commit, still pending,
  or failing with the failure named.
- **Risk and rollback:** the likely blast radius and how to back out.
- **Definition of Done:** the checklist in
  [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) is satisfied or each gap is
  explicitly named.

## Ready means reviewable

Before review, a non-trivial PR must include the smallest view that lets the
reviewer understand the changed behaviour or structure without reconstructing
it from the diff. Use `/show-me` when it is available. Choose one useful
representation, such as a control-flow sketch, component tree, state
transition, sequence, or focused before-and-after diff. Keep trivial changes
diagram-free.

Every label must trace to real files, symbols, states, or evidence in the PR.
Keep warnings and uncertainty visible. The view explains the change; it does
not replace behavioural tests, screenshots, command output, or exact-head CI.

Open a ready PR when the work is reviewable and the body has proof. If a PR
opens before CI finishes, name the pending checks, and report completion once
the latest-sha checks are green.

## Evidence rules

- Use command names, not summaries: `pnpm verify` is useful; "tests passed" is
  not.
- For UI-visible work, include screenshots or video. For docs-only or
  config-only work, write `Not applicable` with the reason and point to deterministic proof such as lint,
  build, or workflow validation.
- If a command fails, keep the failure visible and fix the cause. Keep every
  hook, gate, and check in place while you do.
- If proof depends on a deploy or external service, verify that runtime directly
  before claiming it works there.
- Keep private project details, secrets, tokens, and customer names out of public
  PR bodies. Cite repo-relative paths, placeholders such as `<workdir>/repo`,
  links, and commands; the `PR quality` check fails a body that names a
  machine-local path.

## PR body source

Use [`.github/pull_request_template.md`](../../.github/pull_request_template.md)
for every pull request. The template is the review-facing version of this
contract; this document explains the standard behind it. The `PR quality`
workflow checks the structure, the proof format, the title, and the branch
name; [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md#pr-contract-checks) lists
each check, including the `- Head commit:` line that every push re-checks
against the PR head.

Beside that line, include exactly one of each:

- `- PRDs checked:` lists one or more comma-separated `docs/prd/<feature>.md`
  paths tracked directly in `docs/prd/` at the PR head. For a change outside
  the PRDs, write `None: <reason>` with a reason of at least two words.
- `- PRD impact:` is `None`, or `No behaviour change: <reason>` with a reason
  of at least two words. For every PRD whose `Covers` globs or linked specs
  match a changed path, list it in `PRDs checked` and update that PRD in the
  same PR or provide the explanation. `None` passes when all affected PRDs
  change or no paths are covered. Both paths of a rename count; local
  validation compares `origin/main...HEAD`
  ([ADR 0066](../decisions/0066-prd-impact-in-the-pr-body.md)).
- `- North Star commit:` names the last commit that changed
  `.agents/NORTH_STAR.md` as the PR head sees it: one SHA of 7-40 hex characters,
  optionally in balanced backticks. Read it with
  `git log -1 --format=%H <head> -- .agents/NORTH_STAR.md`.

`PR quality` checks these references at the PR head
([ADR 0057](../decisions/0057-pr-body-names-its-prds-and-north-star-commit.md)).
Review still checks that the selected PRDs and stated outcome fit the change.
Re-check these fields after each push along with the head commit.

Commit screenshot proof on the branch, normally under
`docs/proof/<short-scope>/` (see [`docs/proof/README.md`](../../docs/proof/README.md)),
and embed it inline, as
[`.claude/skills/pr-inline-screenshot-proof/SKILL.md`](../../.claude/skills/pr-inline-screenshot-proof/SKILL.md)
describes.
