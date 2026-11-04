# Run the trials

The orchestrator runs each trial; an agent inside a trial builds its
result from the prompt alone. Run trials one at a time, from the checkout
that keeps the evidence, at the scaffold revision every trial shares
([ADR 0034](decisions/0034-trial-harness-and-evidence.md)):

```bash
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir> --dry-run   # print the plan and the exact claude argv
pnpm trial --trial 1 --scaffold <rev> --trials-root <dir>             # clone, run one fresh session, check, record
pnpm trial --task tooling/trial/tasks/notes.json --trial 1 --scaffold <rev> --trials-root <dir>  # Notes brief
git fetch <dir>/todo-01-<stamp>/repo trial/todo-01:trial/todo-01         # keep the result branch
```

Pass `--agent codex` for a fresh Codex exec session (default: `claude`).
Pass `--task /absolute/path/task.json` for a task file; a task with a target
repository pins its own revision and needs no `--scaffold`. Task-local prompts
and acceptance commands stay outside the clone. External tasks use `land: patch`
and can set an absolute `evidenceDir` to keep private evidence outside this repo.
See [ADR 0048](decisions/0048-trial-tasks-and-codex.md). Todo Codex ids are
`todo-codex-01..03`. Notes ids are `notes-01..03` and
`notes-codex-01..03`; select its task file as above
([ADR 0071](decisions/0071-a-second-trial-brief.md)).
Compare each brief separately: `node tooling/trial/compare.mjs --brief notes`
writes `docs/trials/notes-comparison.md`; the default `--brief todo` keeps
`docs/trials/comparison.md`. Both prove baselines per agent.

The run writes `docs/trials/todo-01.json`, the agent's stream as
`todo-01.stream.jsonl` with secrets redacted, and the result's code as
`todo-01.patch`, and prints its workdir. Fetch the result branch, then remove
the workdir before the next trial; the harness refuses to start while one
remains. Pass `--retry` only after a failure from before the agent started.

Each trial's commands use a private temp and cache folder inside its
workdir, and bubblewrap (`bwrap`) mounts that temp folder over `/tmp`, so the
agent sees only its own `/tmp` files. Install bubblewrap first: a trial fails
before its agent starts when `bwrap` fails to run. No time limit
applies. Stop a trial with Ctrl-C, and read how long it took from
`run.durationMs` and `run.agentDurationMs` in its record
([ADR 0038](decisions/0038-trial-isolation-and-no-time-limit.md)).

A Claude session runs with `--max-turns 100` (`MAX_TURNS` in
`tooling/trial/run-trial.mjs`). Codex exec has no turn-cap flag, so a Codex
run gets the limit from the prompt only
([ADR 0115](decisions/0115-the-todo-research-project.md)).

After the three trials, keep each result branch and merge none of them.
Commit every record, stream, patch and review, and run
`node tooling/trial/compare.mjs` to write `docs/trials/comparison.md`: the
full pass count, the shared baseline and each difference between the runs,
classified against the spec freedoms of
[ADR 0035](decisions/0035-trial-comparison.md) and
[ADR 0037](decisions/0037-type-only-edges-and-flagged-re-exports.md).
Compare reads each run's code from its patch.
Read the report when compare exits non-zero for an inconsistent verdict,
a split baseline, failed runs or a missing review
([ADR 0069](decisions/0069-trial-comparison-fixes-file-layout-and-mutation-outputs.md)).

## The research project

The Todo trials are the template's research project: an example study of how
agents build in this codebase. The prompt is `tooling/trial/todo-prompt.md`.
It asks for a simple, production-level to-do app that follows the lint rules,
with sorted imports, co-located code, the data-layer boundaries, the `@repo/ui`
primitives, thin state in custom `use*` hooks, React Hook Form and React Query,
and Tailwind with scalable values only. It states the 100-turn limit and the
judging question: would you want this code as your codebase?

Run the study at a scaffold revision that includes the Tailwind design tokens
in `packages/ui`, because the prompt names them. A change to the prompt or the
harness starts a new baseline: run all six trials again.

1. Run three Claude trials and three Codex trials, one at a time.
2. After each trial, before you remove its workdir, review its result:

   ```bash
   node tooling/trial/review.mjs --id todo-01 --workdir <dir>/todo-01-<stamp>
   ```

   The review lints `showcase/<id>/` with the vendored anti-slop rules and
   the policy rules using `.oxlintrc.json` and `oxlint.config.ts` directly,
   as the gates do. Both configs include showcase results. It then asks one
   fresh reviewer session, with read access
   only, the judging question in `tooling/trial/review-prompt.md`. It writes
   `docs/trials/<id>.review.json`: lint counts per rule with file and line
   examples, and the reviewer's answer, grouped flags and praise. Claude
   reviews every run by default, so one judge reads all six results; pass
   `--agent codex` for a Codex reviewer.
3. Fetch the result branch, then remove the workdir.
4. Commit the records, streams, patches and reviews, then run
   `node tooling/trial/compare.mjs`. Its "Anti-slop review" section sets the
   reviews side by side, per run and per agent.

The review is evidence for the study and changes no run's status. Run it
only in this loop; pull requests keep their own gates.
