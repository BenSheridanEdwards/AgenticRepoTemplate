# 115. The to-do research project: a turn limit, results kept as patches, and an anti-slop review

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-03
- **Amends:** [0034](0034-trial-harness-and-evidence.md),
  [0035](0035-trial-comparison.md), [0048](0048-trial-tasks-and-codex.md)
- **Depends on:** the Tailwind design-token change on branch
  `feat/ui-tailwind-design-tokens`

## Context

The Todo trials are now the template's research project: an example study
that runs the same to-do prompt three times per model (Claude and Codex) and
compares the results. The maintainer set a new prompt for it. The prompt opens
with a clear-language instruction, asks for a simple, production-level app in
the codebase's own style, allows Tailwind with only scalable values, states a
limit of 100 turns and asks one judging question: would you want this code as
your codebase?

Three recorded rules no longer fit the study:

- No turn limit exists. [0038](0038-trial-isolation-and-no-time-limit.md)
  removed the time limit, and the Claude argv in
  [0034](0034-trial-harness-and-evidence.md) sets no turn cap.
- A passed run lands its code under `showcase/<id>/` on main. The runbook
  merges each passed result branch, and [0035](0035-trial-comparison.md) reads
  a passed run from those tracked files. The study needs its results, not six
  copies of trial code that every gate must then carry.
- Nothing judges the code itself. `pnpm verify` runs the vendored anti-slop
  rules, but `.oxlintrc.json` ignores `showcase/**`
  ([0080](0080-oxlint-skips-every-showcase-result.md)), so those rules never
  see a trial result.

## Decision

**Turn limit.** `run-trial.mjs` exports `MAX_TURNS = 100` and passes
`--max-turns 100` to every Claude session, before `--session-id`. The Codex
CLI (`codex exec`, 0.162.1) has no turn-cap flag, so a Codex run gets the
limit only from the prompt. The prompt states the same number, and a test
holds the prompt sentence equal to the constant. A Claude session that reaches
the limit exits non-zero, so the run fails and counts, as every run does.

**Results stay on their branches.** The harness writes `docs/trials/<id>.patch`
for every run whose agent started, passed or failed. A passed run's patch is
its one result commit. The orchestrator keeps each result branch and merges
none. `land` stays `showcase` in `tasks/todo.json` and `tasks/notes.json`: it
still means that the agent builds under `showcase/<id>/` of the scaffold, with
the lockfile importer rule of [0071](0071-a-second-trial-brief.md). Changing it
to `patch` would count the agent's own lockfile importers as out of scope.
`compare.mjs` reads every run that records a patch from that patch. A passed
run that records no patch, written before this change, still reads from
`showcase/<id>/`, and `checkLandedRuns` now expects exactly those runs under
`showcase/`. A run with a patch that also lands under `showcase/` fails the
comparison. The evidence schema stays at 2: `result.patch` was already a
nullable path.

**Anti-slop review.** `node tooling/trial/review.mjs --id <id> --workdir <dir>`
runs after each to-do run, before its workdir is removed, and writes
`docs/trials/<id>.review.json`. It reads the result in the workdir's check
clone, or the agent's clone when no check ran. It has two parts:

- Mechanical: it runs the scaffold's Oxlint over `showcase/<id>/` with
  `-f json`, once with the vendored anti-slop config and once with the policy
  config, and records the count per rule and the first three file and line
  examples of each. For the anti-slop run it writes a copy of `.oxlintrc.json`
  into the workdir that drops only the `showcase/**` ignore, and records that
  dropped pattern. `.oxlintrc.json` itself stays as it is.
- Judgment: one fresh reviewer session reads the result and answers
  `tooling/trial/review-prompt.md` in a fixed JSON schema: `wouldWant`
  (`yes` or `no`), `why`, grouped `flags` with file and line, and `praise`.
  Claude runs with `--tools Read,Grep,Glob` and `--max-turns 100`; Codex runs
  with `--sandbox read-only`. The default reviewer is Claude for every run, so
  one judge reads all six results; `--agent codex` selects Codex. The record
  keeps the reviewer's CLI, version, argv (workdir paths replaced) and prompt
  hash.

The review prompt is repository-owned. Upstream anti-slop at
`13909c9e07590f5a85d93c62712259fe14a883f7` ships only an install skill and no
review skill, so the prompt restates the intent of the vendored rules and adds
the codebase rules of the new trial prompt. Nothing new is vendored.

The review is evidence, not a gate. It never changes a run's status. It runs
only in the research loop: no CI workflow, Git hook, `pnpm verify` step, PR
template or confidence grade calls it, and `pnpm lint:anti-slop`, its rules
and [0070](0070-vendored-anti-slop-oxlint-rules.md) stay as they are.
`compare.mjs --brief todo` adds an "Anti-slop review" section after the
verdict, with one row per run, totals per agent, and each run's flags by group
and its praise. Reviewer text appears inside code spans. A to-do run with no
review adds `Missing review: <id>` to the failures, so compare exits non-zero
until every run is reviewed. The Notes comparison is unchanged.

**New baseline.** The prompt, the harness files and the enforcement rev all
change, so the rule of [0034](0034-trial-harness-and-evidence.md) starts a new
baseline. Runs must use a scaffold revision that holds both this change and
the Tailwind design-token change, because the prompt names Tailwind and the
`@theme` tokens in `packages/ui` as dependencies that the reference declares.

## Consequences

- Main keeps the records, streams, patches, reviews and comparison of every
  run, and no trial code. The gates on main judge no trial result, and a
  reviewer reads a result from its patch or its kept branch.
- A Claude run that needs more than 100 turns fails. The earlier Todo runs
  took 20 to 24 turns, so the limit leaves room. A Codex run can exceed the
  limit without a stop, which the comparison shows only through its stream.
- The reviewer is a model, so its judgment varies between sessions. The
  record keeps the reviewer's version and prompt hash, and the mechanical
  counts are repeatable.
- A run that passed `pnpm verify` can still show anti-slop findings, because
  `verify` never applies those rules to `showcase/`.
- No dependency is added.
