# 68. Grade merge confidence on import blast radius

- **Status:** Proposed (Ben confirms the decision and 20-file threshold by approving)
- **Date:** 2026-10-25
- **Builds on:** [0064](0064-merge-confidence-label.md), [0032](0032-api-ui-greeting-and-contract.md), [0017](0017-required-gates-aggregate.md)

Delivery is staged for #138: piece 1 produces evidence; piece 2 grades it. Grading below is the proposed complete result.

## Context and spike

A green gate set says little about reach through importers. Fallow 3.33.1 owns this graph.
At `d602d9a`, rerunning `fallow dead-code --impact-closure <file> --format json --quiet` confirms:

- `kind: trace`, `seed`, and `affected_not_shown` give the transitive reverse closure, excluding the seed.
  Button has 57 tracked importers: seven in `apps/web`, its UI package, and all six Todo showcase results.
- GreetingMessage has six importers, all under `apps/web`: `index.html`, `src/App.tsx`, `src/main.tsx`,
  and greeting's `GreetingPage.test.tsx`, `GreetingPage.tsx`, `index.ts`.
- `coordination_gap[].consumer_file` names export consumers through re-exports.
- README and deleted paths return `error: true`, `exit_code: 2` and `file '<path>' not found in module graph`.
  Other failures invalidate evidence. Discard run-specific `_meta` telemetry.
- `fallow guard <paths...> --format json --quiet` returns `kind: guard` and `files[].zone`.
  Names include `ui`, `web-app`, `web-routes/greeting`; HTML has `null`. Preserve these zones.

## Decision

Union each changed file's closure, intersect with `git ls-files`, and exclude every changed path.
Deduplicate and sort. Keep per-seed reach so two unrelated edits alone cause no amber.
Preserve deleted and out-of-graph seeds as `inGraph: false` with empty importer/consumer arrays.
Use units `packages/<name>`, `apps`, `showcase/<id>`, and `root` for remaining paths.
Grade amber for a seed reaching another unit or a union exceeding 20 importers; exactly 20 passes.
Report count, units, zones and up to ten sorted, distinct coordination-gap consumers. Red takes priority.
Reconcile acceptance 2 by keeping composition roots: GreetingMessage reaches only its own result,
so it causes no cross-boundary amber. Ben confirms this interpretation and the threshold.

Version 1 JSON carries `version`, PR `head`, `files` entries (`path`, `inGraph`, `importers`, `consumers`),
and `zones` mapping paths to Fallow names or `null`. Trusted main code grades it in piece 2, validating
version, head, safe paths, types and changed-file completeness. Read artifacts only as untrusted data;
execute only main's scripts in the privileged workflow. Evidence integrity relies on review of PR
changes to the collector and Fallow configuration. Missing or invalid evidence grades red with
`blast radius unavailable`, including cancelled runs and artifacts past seven days; rerun CI to restore it.

Collect after the existing CI `fallow` checks on PR and push runs. Compare `HEAD^1...HEAD_SHA` with
`core.quotePath=false` to match the API's PR file list, including deletions and Unicode paths. Record
PR head SHA, or `github.sha` on push (the last commit's diff); piece 2 reads only PR-run artifacts.
Check git diff separately so its failure propagates. Empty diffs produce empty evidence; missing inputs,
malformed Fallow output and command errors fail collection and the required lane. ADR 0017 rejects
PR-only conditions and advisory collection; this adapts the original plan without changing that policy.
Upload `blast-radius.json` as `blast-radius` for seven days, using the existing nonblocking upload exception.
Grading stays advisory and adds no required check.

## Alternatives and consequences

Reject symbol-oriented, depth-bounded `trace`, exact-export `--symbol-impact`, and `inspect`'s larger
wrapper around the same closure. Reject handwritten import parsing and another dependency: Fallow owns
the graph. Reject amber for unavailable evidence; absence cannot justify a passing grade.
Reject PR-only or `continue-on-error` collection under ADR 0017's step policy.
The trusted confidence workflow cannot grade its own introduction PR. Piece 1 only publishes evidence.
Coverage grading (#137 / #150) stays separate; whichever lands second rebases shared workflow/doc hunks.
`scripts/blast-radius.test.ts` proves shaping, failures, real CLI outputs, deleted/empty inputs and the
PR file list. The workflow edit waits for Ben's head-specific enforcement sign-off; this ADR stays Proposed.
