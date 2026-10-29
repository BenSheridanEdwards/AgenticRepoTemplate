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
`todo-01.stream.jsonl` with secrets redacted (and `todo-01.patch` when it
fails), and prints its workdir. Fetch the result branch, then remove the
workdir before the next trial; the harness refuses to start while one
remains. Pass `--retry` only after a failure from before the agent started.

Each trial's commands use a private temp and cache folder inside its
workdir, and bubblewrap (`bwrap`) mounts that temp folder over `/tmp`, so the
agent sees only its own `/tmp` files. Install bubblewrap first: a trial fails
before its agent starts when `bwrap` fails to run. No time limit
applies. Stop a trial with Ctrl-C, and read how long it took from
`run.durationMs` and `run.agentDurationMs` in its record
([ADR 0038](decisions/0038-trial-isolation-and-no-time-limit.md)).

After the three trials, merge each passed result branch with `git merge --no-ff`,
commit every record, stream and patch, and run
`node tooling/trial/compare.mjs` to write `docs/trials/comparison.md`: the
full pass count, the shared baseline and each difference between the runs,
classified against the spec freedoms of
[ADR 0035](decisions/0035-trial-comparison.md) and
[ADR 0037](decisions/0037-type-only-edges-and-flagged-re-exports.md).
Read the report when compare exits non-zero for an inconsistent verdict,
a split baseline or failed runs
([ADR 0069](decisions/0069-trial-comparison-fixes-file-layout-and-mutation-outputs.md)).

