# 62. Pre-commit steps stay under 30 seconds; the up-to-date check runs at push

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-24
- **Amends:** [0002](0002-quality-gates-as-code.md),
  [0028](0028-pre-push-runs-the-full-local-gate-suite.md)
- **Superseded in part by:** [ADR 0073](0073-adopt-the-typescript-toolchain-standard.md)
  for Biome lint ownership; implementation follows in separate PRs.

## Context

On 24 October 2026 at 12:06 BST Ben asked to move the up-to-date-with-main
check from pre-commit to pre-push, and set a rule: every pre-commit check
finishes in under 30 seconds, and a slower one is examined carefully and likely
moved out of pre-commit. At 12:07 BST he kept the format check in pre-commit,
since it takes a few seconds. This decision follows that final revision.

Pre-commit ran a networked freshness check with an offline fallback to the
last known `origin/main`. Pre-push already ran the strict form on every pushed
branch, and CI runs it on the PR head, so the pre-commit copy duplicated a
stronger check.

## Decision

- `.husky/pre-commit` runs `pnpm typecheck`,
  `pnpm exec biome check --error-on-warnings --staged --no-errors-on-unmatched .`,
  `pnpm fallow:audit` and `pnpm secret-scan`, in that order. Biome keeps both
  lint and format checks. Only Biome and gitleaks are staged-scoped: typecheck
  covers the project, and Fallow audits files touched against its base.
- `fallow audit` already covers dead code, cycles, complexity, duplication and
  styling for the touched files. CI runs the same audit subcommand at the
  pinned version with the same config. Rules, thresholds and severities stay
  unchanged.
- `.husky/pre-push` keeps the same commands:
  `sh scripts/require-up-to-date-main.sh --pushed-refs`, then `pnpm verify`
  (which includes `pnpm build` and `pnpm size`) and `pnpm e2e`. The freshness
  check and build each already run there, so neither needs another copy.
- `scripts/require-up-to-date-main.sh` retains its `--allow-offline` mode and
  conflicted-merge `MERGE_HEAD` allowance. Pre-push and CI use the strict mode
  and fail closed when fetching main fails.
- Each pre-commit step must finish in under 30 seconds on a realistic staged
  change. Record per-step wall-clock measurements in the PR. Review examines
  any slower step carefully for a likely move to pre-push; a timing result
  alone does not authorise silently changing the hook. The budget remains a
  documentation rule held by review, with no timing-enforcement code.

## Consequences

- A commit no longer fetches main. A commit on a stale branch can succeed;
  the push refuses it, naming the merge remedy.
- Fallow's pre-commit base is the last fetched `origin/main`, with local
  `main` as fallback when that remote ref is absent. The pre-push freshness
  check refreshes `origin/main` before `pnpm verify` audits again; CI also
  audits against its fetched base.
- Typecheck time grows with the project rather than the staged change.
  Measurements describe the actual machine and change, not a guaranteed
  runtime for every checkout.
- Candidates for pre-commit, not adopted: Fallow production health on the
  staged diff against a saved baseline, and React Doctor, whose warnings fail
  (`--blocking warning`). The production-health baseline command is distinct
  from the existing Fallow audit that already checks complexity. React
  Doctor already runs through `pnpm verify` at push and in CI. Its
  warning-failing behaviour must be reviewed against the 30-second rule
  before a pre-commit decision. Candidate timings belong to the separate
  timing run; neither candidate is added to pre-commit here.
