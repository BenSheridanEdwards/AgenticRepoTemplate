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
- **Visual proof:** screenshots, video, StyleProof report, or `N/A` with a
  reason. Any UI-visible or CSS change needs visual proof.
- **CI status:** whether checks are green for the latest commit, still pending,
  or failing with the failure named.
- **Risk and rollback:** the likely blast radius and how to back out.
- **Definition of Done:** the checklist in
  [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) is satisfied or each gap is
  explicitly named.

## Ready means reviewable

Open a ready PR when the work is reviewable and the body has proof. Do not open
placeholder PRs with missing verification and then call the work done. If a PR
must be opened before CI finishes, say exactly which checks are pending and do
not report completion until the latest-sha checks are green.

## Evidence rules

- Use command names, not summaries: `pnpm verify` is useful; "tests passed" is
  not.
- For UI-visible work, include screenshots, video, or the StyleProof report. For
  docs-only or config-only work, write `N/A` and point to deterministic proof
  such as lint, build, or workflow validation.
- If a command fails, keep the failure visible and fix the cause. Never use
  `--no-verify`, weaken a gate, or remove a check to make the PR green.
- If proof depends on a deploy or external service, verify that runtime directly
  before claiming it works there.
- Keep private project details, secrets, tokens, customer names, and local-only
  paths out of public PR bodies.

## PR body source

Use [`.github/pull_request_template.md`](../../.github/pull_request_template.md)
for every pull request. The template is the review-facing version of this
contract; this document explains the standard behind it. The body must preserve
these sections, in order: `Why does this feature exist?`, `What changed?`,
`Behavioural Proof (with video and screenshots)`, and `Verification Summary`.
The `PR quality` workflow ([`scripts/validate-pr-body.mjs`](../../scripts/validate-pr-body.mjs))
fails a PR whose body omits a section, leaves one placeholder-only, carries no
proof, or whose title is not Conventional Commits.

## PR Proof Law

Every PR must follow
[`.claude/skills/pr-inline-screenshot-proof/SKILL.md`](../../.claude/skills/pr-inline-screenshot-proof/SKILL.md).

- Screenshot proof must be committed to the branch, normally under
  `docs/proof/<short-scope>/` (see [`docs/proof/README.md`](../../docs/proof/README.md)).
- The PR body must embed screenshots inline with Markdown image syntax:
  `![Descriptive alt text](https://github.com/OWNER/REPO/blob/BRANCH/docs/proof/SCOPE/file.png?raw=1)`.
- Bare screenshot links, local filesystem paths, relative paths, and "see
  attached" placeholders do not satisfy proof.
- After creating or editing the PR, inspect the body with
  `gh pr view <number> --json body --jq .body` and confirm the proof section
  contains `![`.
- If no rendered or behavioural proof applies, write `Not applicable` in the
  proof section with the technical reason.
