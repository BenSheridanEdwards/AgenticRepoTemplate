# 60. Product intent needs sign-off

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-23
- **Builds on:** [0045](0045-prds-state-intent-and-link-their-specs.md)
- **Supersedes in part:** [0023](0023-protect-only-the-files-that-run-the-gates.md), [0024](0024-sign-off-only-loosening-enforcement-changes.md)

## Context

ADRs 0023 and 0024 protect enforcement changes with Ben's head-specific
sign-off. PRDs and the North Star sit outside those guarded paths, so an agent
can change the intent against which its work is reviewed without that human
signature. Issue #135 adds the same review boundary to product intent.

This supports the North Star's software-factory outcome: the repository makes
the standard executable for every agent and harness, and a named human owns
the decision to change the intended outcome. Unlike a lint rule, intent has no
meaningful tighten/loosen direction. Even a wording-only edit can change what
the repository asks an agent to build.

## Decision

- Add a Product intent entry to `GUARDS` in
  `scripts/enforcement-approval.mjs`. It covers every path under `docs/prd/`
  and the exact path `.agents/NORTH_STAR.md`, using the existing rewrite
  judge with the edit reason `edits product intent`.
- Require BenSheridanEdwards's sign-off for every addition, edit, deletion or
  rename of those paths. The existing rename handling checks both paths, so
  moving a PRD out of the folder still asks for approval.
- Reuse ADR 0024's status, comment and head-bound checkbox protocol. Only
  Ben's fresh tick for the current head approves it, and every push resets
  that approval. The existing enforcement judges retain their behavior.
- Supersede ADR 0023's path exclusion only for product intent. Supersede
  ADR 0024's rule that only enforcement loosening or rewriting asks for a
  sign-off only for those product-intent paths. Other guidance, including
  `.agents/PROGRESS.md`, remains outside the guard.
- Update the start-here rules and gate/infrastructure guidance alongside the
  guard. `check-sign-off-docs.mjs` already reads `GUARDS`, so its implementation
  stays unchanged.

## Consequences

- The gate reports Product intent problems for new, changed or removed PRDs
  and North Star files. Regression tests cover those changes, renames and
  the unguarded boundaries. The local CLI exposes the same result through
  `node scripts/enforcement-approval.mjs --git origin/main HEAD`.
- The PRD coverage change in PR #133 (plan PR 3) merges before this guard.
  This implementation changes neither a PRD nor the North Star. Its own
  sign-off covers the edits to the enforcement gate's script and test.
- The `pull_request_target` workflow runs main's copy of the gate. The new
  product-intent guard therefore takes effect only after this change merges.
  On the first subsequent PR touching a PRD, the reviewer/merger records the
  red `enforcement-approval` status, Ben's current-head tick and the resulting
  green status in a follow-up comment on this implementation's PR. That live
  check remains pending until then.
- This decision adds no dependency, workflow, approval identity or second
  sign-off mechanism. Ben accepts this proposed ADR by approving the PR.
