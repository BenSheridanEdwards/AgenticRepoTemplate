# 47. Keep trial unit tests on fixtures and handle the no-evidence state

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-20
- **Amends:** [0035](0035-trial-comparison.md)
- **Implements:** [0034](0034-trial-harness-and-evidence.md)

## Context

[0034](0034-trial-harness-and-evidence.md) starts a new baseline when the
scaffold, enforcement rev, lockfile, prompt, harness, CLI, model or user config
change, and all three Todo trials run again. The Effect 4 move
([0036](0036-effect-4.md)) and the later gate changes started that new baseline,
so the committed `todo-01..03` under `docs/trials/` and `showcase/` must be
rerun and replaced.

The documented rerun cannot produce a passing trial today. The harness refuses
a scaffold that holds any `showcase/*` result
([0034](0034-trial-harness-and-evidence.md), step 2), which is correct, so the
rerun's scaffold must be a commit that removes the old results
(`showcase/todo-02`, `showcase/todo-03` and their lockfile importers) and the
old records in `docs/trials/` (`todo-0N.json`, `todo-0N.stream.jsonl`,
`todo-01.patch`, `comparison.md`). That removal is the first commit of the later
evidence PR, not part of this change.

In such a scaffold, and in every trial clone (the scaffold plus the agent's new
`showcase/todo-0N/`, with no record for it yet), `pnpm verify` must pass, or
every trial fails its `verify` check. It could not, because the unit tests and
the drift check read the committed evidence as live data:

- `tooling/trial/compare.test.ts` reads `docs/trials/todo-01.patch` as the BASE
  tree for the comparison tests, `docs/trials/todo-0N.json` and their streams
  for the `renderComparison` and `checkRunEvidence` tests, and one landed
  `showcase/todo-02/architecture.mmd` to cross-check the patch.
- `tooling/trial/evidence.test.ts` runs `it.each` over the committed
  `docs/trials/todo-0[1-3].json`; an empty table makes Jest fail.
- The drift test "the committed comparison" calls `comparisonReport(ROOT)`,
  whose `readRuns` reads `docs/trials` and whose `checkLandedRuns` throws when
  `showcase/` holds a result with no record, which is exactly a trial clone
  mid-run.

## Decision

**Test data lives in committed fixtures.** The records, streams, patch and the
one showcase diagram the unit tests use are copied, byte for byte, into
`tooling/trial/fixtures/` and the tests read them there. `docs/trials/` is left
untouched by this change, so main's current evidence and report stay valid until
the rerun replaces them. `compare.test.ts` maps each test-data path to its
fixture through its `read` helper, so every assertion keeps its meaning and its
exact bytes; `evidence.test.ts` reads the three records from the fixtures. The
fixtures are plain data: Biome formats the `.json` copies (already formatted),
and the `.jsonl`, `.patch` and `.mmd` copies are unknown extensions it skips.

**The no-evidence state.** `compare.mjs` gains `hasTrialEvidence(root)`: true
when `docs/trials/` holds a `*.json` record, false when the folder is empty or
gone. With no record there is no report to keep current, so the generator writes
nothing and the drift test asserts `docs/trials/comparison.md` is absent instead
of comparing. When any record exists the drift test stays exactly as strict as
before: the committed report must equal a freshly generated one. A unit test
covers both states. The `readRuns` reader no longer throws on a missing
`docs/trials/`, so a rerun scaffold and a trial clone both pass.

The harness files are unchanged, so the harness hash (`run-trial.mjs`,
`evidence.mjs`, `stream.mjs`, `system.mjs`) stays; `compare.mjs` is not part of
it. The prompt, the acceptance spec and every guarded gate file are unchanged.

## Consequences

- A rerun scaffold (old results and records removed) passes `pnpm verify`, and
  so does each trial clone, so the rerun can run the three trials and land the
  new baseline.
- The fixtures duplicate the committed evidence until the rerun's removal commit
  deletes the originals. After that commit the fixtures are the only committed
  copies of the old records, which is their purpose: unit test data that does
  not depend on the live evidence.
- When the rerun lands its new records and regenerates `comparison.md`, the
  drift test takes its strict branch again automatically, with no further
  change.
- No dependency is added.
