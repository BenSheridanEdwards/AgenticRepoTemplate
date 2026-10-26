# 66. The PR body accounts for changes to PRD-covered behaviour

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-25
- **Builds on:** [0045](0045-prds-state-intent-and-link-their-specs.md), [0057](0057-pr-body-names-its-prds-and-north-star-commit.md), [0058](0058-prds-name-the-code-they-cover.md)

## Context

ADR 0045 links intent to the E2E behaviour map and leaves a PR-impact check
as a possible follow-up. ADR 0057 records the PRDs an author checked, and ADR
0058 gives each PRD machine-readable coverage. A PR can still change covered
code while leaving its PRD unchanged and offering no explanation. Issue #134
connects those existing inputs to the changed paths.

This advances the North Star's software-factory outcome: every agent meets
the same executable standard, and the reviewer sees the affected intent and
its evidence. It follows Sarah Fim's [video](https://x.com/sarahfim/status/2108298553823203613)
and [write-up](https://x.com/sarahfim/status/2109736893198016898), cited by
[the North Star](../NORTH_STAR.md).

## Decision

- Add exactly one `- PRD impact:` line to the Verification Summary. Its value
  is `None`, or `No behaviour change: <reason>` with at least two words in
  the reason, using the existing reason word-count rule.
- For each PRD whose `Covers` globs or linked specs match a changed path,
  require that PRD in `PRDs checked:`. Also require either a change to the
  PRD itself in the same PR or the no-behaviour-change explanation. `None`
  passes when every affected PRD changes with the code, or when no changed
  path is covered. An error names the affected PRD and both ways to fix it.
- Keep the validation pure in `scripts/validate-pr-body.mjs`, with injected
  changed files and PRD coverage. Reuse `parseBehaviours` and `coveredPaths`
  from `scripts/check-prd-conflicts.mjs`; match its glob strings with
  `matchesGlob` from `node:path`. Read PRDs from the head commit, so a CI
  merge checkout or uncommitted local file cannot change coverage.
- The CLI reads changed paths with
  `git diff --name-only --no-renames -z <base>...<head> --`. Disabling rename
  detection exposes both the removed and added paths, including a move out
  of a covered folder. NUL separators preserve file names containing
  whitespace. Local validation defaults to `origin/main...HEAD`.
- Pass `PR_BASE_SHA` raw from `github.event.pull_request.base.sha`, beside
  `PR_HEAD_SHA`. Require a full 40-character hexadecimal SHA when the
  variable is set or the command runs in GitHub Actions. Missing CI input
  and malformed input fail instead of falling back to a local ref.
- Install the repository's existing dependencies with the frozen lockfile
  in the PR-quality job so the shared parser can load its TypeScript
  dependency. This adds no dependency or second parser.
- Add the field and its rules to the PR template, PR quality contract and
  Definition of Done. Unit tests cover the field's shape, affected and
  unaffected paths, PRD updates, sufficient and insufficient reasons,
  missing PRD references, rename paths and base-input validation.

## Consequences

- Piece 1 of issue #134 adds the field and validates its shape. Coverage
  matching and the workflow input arrive in piece 2 of #134,
  completing ADR 0045's PRD-impact follow-up. PRDs for showcase results and
  approval for changes to product intent remain separate work.
- Every open PR needs the new field on its next body validation. A code
  or spec change covered by a PRD has an explicit
  reviewable explanation or a paired PRD update. Re-check the fields after
  every push.
- The check proves that the declaration exists and the relevant
  PRD changes are present. Review still judges the explanation,
  coverage declarations, and whether a PRD update reflects the behaviour change.
- Piece 2's workflow edit requires Ben's head-commit enforcement
  sign-off under ADRs 0023 and 0024. Ben accepts this ADR by approving the PR.
  Product behaviour and the E2E behaviour map stay unchanged.
