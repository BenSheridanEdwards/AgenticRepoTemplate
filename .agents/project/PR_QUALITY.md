# PR Quality Contract

A pull request is ready for review only when it explains the change and proves
the change. The proof must be specific enough that a reviewer can separate:

- what passed locally;
- what GitHub Actions proved on the latest commit;
- what was verified in a browser or deployed runtime;
- what remains unverified.

Do not collapse those into one vague "all good" statement.

## Required proof

Every PR body must include:

- **Why:** the problem, risk, or capability the change exists to address.
- **What changed:** the smallest reviewable summary of the diff.
- **Local verification:** exact commands run, with pass/fail status.
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
transition, sequence, or focused before-and-after diff. Do not add a diagram to
a trivial change.

Every label must trace to real files, symbols, states, or evidence in the PR.
Keep warnings and uncertainty visible. The view explains the change; it does
not replace behavioural tests, screenshots, command output, or exact-head CI.

Open a ready PR when the work is reviewable and the body has proof. Do not open
placeholder PRs with missing verification and then call the work done. If a PR
must be opened before CI finishes, say exactly which checks are pending and do
not report completion until the latest-sha checks are green.

## Evidence rules

- Use command names, not summaries: `pnpm verify` is useful; "tests passed" is
  not.
- For UI-visible work, include screenshots or video. For docs-only or
  config-only work, write `Not applicable` with the reason and point to deterministic proof such as lint,
  build, or workflow validation.
- If a command fails, keep the failure visible and fix the cause. Never use
  `--no-verify`, weaken a gate, or remove a check to make the PR green.
- If proof depends on a deploy or external service, verify that runtime directly
  before claiming it works there.
- Keep private project details, secrets, tokens, customer names, and local-only
  paths out of public PR bodies.

## PR body source

Use [`.github/pull_request_template.md`](../../.github/pull_request_template.md)
for every pull request. The template is the review-facing version of this
contract; this document explains the standard behind it. The `PR quality`
workflow checks the structure, the proof format, the title, and the branch
name; [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md#pr-contract-checks) lists
each check. Commit screenshot proof on the branch, normally under
`docs/proof/<short-scope>/` (see [`docs/proof/README.md`](../../docs/proof/README.md)),
and embed it inline, as
[`.claude/skills/pr-inline-screenshot-proof/SKILL.md`](../../.claude/skills/pr-inline-screenshot-proof/SKILL.md)
describes.
