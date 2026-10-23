# 57. The PR body names its PRDs and North Star commit

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-23
- **Builds on:** [0029](0029-pr-body-names-its-head-commit.md), [0045](0045-prds-state-intent-and-link-their-specs.md)

## Context

ADR 0029 binds the PR body to its head commit. ADR 0045 gives features PRDs
that state intent and link the E2E tests proving their behaviours. A PR can
still pass the body check without saying which intent the author checked.
Issue #130 makes those references part of the review contract, so every agent
names the same reviewable inputs to its work.

This advances the North Star's software-factory outcome: the repository
carries standards across agents and harnesses, and a person can judge a PR
from its stated outcome and evidence. It follows the executable-standards
principle behind Sarah Fim's [video](https://x.com/sarahfim/status/2108298553823203613)
and [write-up](https://x.com/sarahfim/status/2109736893198016898), cited in
[the North Star](../NORTH_STAR.md).

## Decision

- Add exactly one `- PRDs checked:` line beside `- Head commit:` in the
  Verification Summary. Its value is one or more comma-separated
  `docs/prd/<feature>.md` paths. Each names a tracked Markdown file directly
  in `docs/prd/` at the PR head, following ADR 0045's definition of a PRD.
  Alternatively, write `None: <reason>`, with a reason of at least two words,
  using the existing word-count rule for `Not applicable` proof.
- Add exactly one `- North Star commit:` line there. Its value is one SHA of
  7-40 hex characters, optionally in balanced backticks. Compare it as a
  case-insensitive prefix of the last commit to change `.agents/NORTH_STAR.md`
  as seen at the PR head. A PR that changes the North Star names the commit
  making that edit, rather than the previous North Star revision.
- Extend `validatePullRequest` with the injected ports `listPrdFiles()` and
  `northStarCommit(headSha)`. Unit tests supply these ports without a
  repository. When `headSha` is explicitly `null`, check only the fields'
  shapes and leave both ports unused. With a real head, unavailable repository
  evidence fails the check.
- Wire the CLI ports to Git. List PRDs from the head's tree, so the CI merge
  checkout and local uncommitted files cannot change membership. Read the
  North Star revision with
  `git log -1 --format=%H <head> -- .agents/NORTH_STAR.md`. Keep the existing
  `PR_HEAD_SHA` handling and local `git rev-parse HEAD` fallback; local
  `pnpm validate:pr` needs no new environment variables.
- Set `fetch-depth: 0` on the checkout in `.github/workflows/pr-quality.yml`
  so the head tree and North Star history are available. Keep the existing
  event inputs and triggers. Add the fields to the PR template, PR quality
  contract and Definition of Done.

## Consequences

- `PR quality` fails a missing or duplicate field, an invalid PRD path, a
  `None` without a sufficient reason, a malformed North Star SHA, or a SHA
  that does not name the last North Star change at the head. Errors name the
  field to repair.
- Before merging this change, update every open PR body with both fields.
  Subsequent pushes require re-checking the intent references together with
  the existing head-commit field.
- The check proves that references exist and name the expected revision.
  Review still judges whether the PRDs selected, the reason for `None`, and
  the proposed outcome fit the change. PRD-impact checks and approval for
  edits to product intent remain separate work.
- The workflow edit requires Ben's head-commit enforcement sign-off under
  ADRs 0023 and 0024. Ben accepts this ADR by approving the PR. This change
  adds no dependency or product behaviour.
