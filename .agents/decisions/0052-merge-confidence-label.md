# 52. Label every pull request with a merge confidence level

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-22
- **Builds on:** [0017](0017-required-gates-aggregate.md),
  [0045](0045-prds-state-intent-and-link-their-specs.md)

## Context

Sarah Fim's [video](https://x.com/sarahfim/status/2108298553823203613) and
[write-up](https://x.com/sarahfim/status/2109736893198016898) describe an
anti-slop factory where a human reviews only what the machine could not settle.
Issue #69 names the gap: nothing tells a reviewer how much to trust a green pull
request. The required gates are binary and fail-closed (ADR 0017), so branch
protection already holds a PR whose required check fails. The signal a reviewer
lacks is a grade on the PRs that are already green: which ones carry a gap worth
a human's minutes, and which are clean.

Two inputs the acceptance names have no measure today. Playwright collects no
code coverage, so there is no file-level map from a changed source file to the
E2E specs that exercise it. PRDs are new (ADR 0045) and sparse. A precise
browser-coverage measure would slow the E2E lane for a signal that only grades
an already-green PR.

## Decision

CI labels every pull request `confidence: green`, `confidence: amber` or
`confidence: red`. `scripts/confidence-label.mjs` owns the decision as pure
functions, with `scripts/confidence-label.test.ts` as the proof.
`.github/workflows/confidence.yml` gathers the inputs and applies the label.

**Levels.** The label grades a PR from the merge-required checks and two gap
measures:

- `red` when any required check (the `Required gates` aggregate and each
  stand-alone check from the one contract in `scripts/required-gates.mjs`) is
  failing, pending or missing. A PR that has not passed its gates is the least
  trustworthy state.
- `amber` when every required check passes and one or more named gaps remain.
- `green` when every required check passes and no gap remains.

For each check name, judge only the run with the highest `started_at`, breaking
ties by the highest `id`. Count `skipped` as passing only for a stand-alone
gate with a declared `if` in `REQUIRED_GATES`; every other non-success result
stays red. Read that exception from the contract, keeping one list of gates.

The gates stay the fail-closed merge bar (ADR 0017); the label adds a grade on
top of them and gates nothing.

**E2E coverage of the changed files.** A slice is a changed source file under a
result's `web/src/routes/<name>/` or `web/src/features/<name>/`. A slice is
covered when an E2E spec in that result's `web/e2e/` names it, matched on the
slice name after lowercasing both and joining runs of other characters with a
hyphen, then matching the whole hyphen-padded slug. `greet` does not match
`greeting`; `page-header` matches `Page Header`. Choose triage option B,
the coarse, cheap measure: it maps a changed slice to the specs
that name it rather than instrumenting the browser, so the E2E lane keeps its
speed. A changed slice no spec names is a gap.

**PRD status.** Count a PRD in `docs/prd/` only when it names the whole slice
slug and links a spec in the slice's own result: its text contains
`<result>/web/e2e/`. The reference greeting PRD therefore covers `apps`, and
leaves a showcase `greeting` slice uncovered. Follow ADR 0045 for the PRD's
proof links. Proceed now: issue #68 is closed and `docs/prd/greeting.md`
exists, so this change uses both inputs from its first run.

**Gaps that count.** A changed slice with no E2E spec, and a changed slice with
no PRD. Both read off the diff and the PR checkout text alone, so the grade is
deterministic. Other candidate gaps (a `Not applicable` proof section on a UI
change, an enforcement path awaiting sign-off, a coverage drop) wait until they
have an equally deterministic measure.

**Presentation.** Apply the level as a PR label and list its reasons in the job
summary, answering the fifth triage question with both views.

**Trust model.** Run only the default branch's script and gate contract, using
its `.nvmrc`. Check out the PR head separately at `pr` with persisted
credentials disabled in both checkouts. Walk its spec and PRD folders and read
text through `PR_ROOT`; import and execute only trusted code. Require a JSON
array in `CHECK_RUNS` and an existing `PR_ROOT`, failing visibly on bad input.
Use top-level `permissions: {}` and grant the job `contents: read`,
`checks: read` and `pull-requests: write`. The
[REST label endpoints](https://docs.github.com/en/rest/issues/labels#create-a-label)
accept `pull-requests: write` for creation, addition and deletion. Apply labels
through REST, deleting only other confidence labels actually present and
surfacing API errors.

**Trigger.** `confidence.yml` runs on `workflow_run` when CI, CodeQL,
Lighthouse or PR quality completes. Each completion reads the head commit's
check runs and re-grades, so the label settles as the stand-alone checks
finish. Handle only completions whose original event was `pull_request`.
Use the event's PR number or fall back to open PRs from `commits/{sha}/pulls`.
Compare the live PR head with the event SHA before grading and again before
applying a label. Skip stale heads, and cancel older grading jobs for the same
SHA through `confidence-<sha>` concurrency. Like every `workflow_run` and `pull_request_target` workflow, GitHub
runs the default branch's copy, so the label starts grading once this is on
main; the PR that adds it cannot grade itself.

## Proof and consequences

`scripts/confidence-label.test.ts` drives the pure functions: slice detection
across routes, features and results; coverage and PRD gaps against the reference
greeting spec and PRD, including the result-scoping of specs; the red/amber/green
decision; latest-run selection, permitted skips and whole-slug matching; and
the mapping of raw check runs to a required-check verdict. CLI tests use a
separate fixture checkout, assert output and summary files, reject missing or
invalid inputs, and check the three label definitions. `pnpm
test` runs them in the `tooling` project, and `pnpm verify` runs that suite.

`.agents/project/QUALITY_GATES.md` documents the levels, the inputs and the
measure, as the acceptance asks. The workflow is a new file under
`.github/workflows/`, so it waits for the enforcement sign-off on its head
commit (ADR 0024). The label is advisory: no required gate, tool owner, UI
behaviour or dependency changes, and `scripts/required-gates.mjs` stays the one
list of what a PR must pass.

Keep the scope coarse: a spec naming a slice is a mapping signal, not browser
code coverage or proof that every changed line ran. Fork discovery is limited
to the PR supplied by the event or what `commits/{sha}/pulls` returns. The
workflow cannot grade its own introduction PR; the first real grade appears
on a subsequent PR after it lands on main.
