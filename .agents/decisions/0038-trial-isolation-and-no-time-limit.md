# 38. Give each trial a private temp folder and no time limit

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Amends:** [0034](0034-trial-harness-and-evidence.md)

## Context

[0034](0034-trial-harness-and-evidence.md) runs each Todo trial's agent with
the caller's `TMPDIR`, `XDG_CACHE_HOME`, `XDG_RUNTIME_DIR` and `COREPACK_HOME`,
so the agent, Claude Code and every check shared the box's `/tmp` and
`~/.cache` with other jobs. To keep tool output readable, its outside-reads
allowlist let in `<tmp>/claude-<uid>/<clone slug>/`, any tmp entry that
appeared while the agent ran, and all of `~/.cache`. `todo-01` failed on
`/tmp/verify.log`, a file another job had left there, so a trial's result
depended on what else ran on the box. 0034 also stopped the agent after 90
minutes and each check after a fixed limit, which ends a slow but correct run
as a failure.

## Decision

**A private temp and cache folder per trial.** The harness creates
`<workdir>/tmp` and `<workdir>/cache` (mode 0700) inside the trial's own
workdir. The commands that run the trial's code get them: the setup install,
`claude --version`, the agent and the result commit's hooks. The checks get
their own `<workdir>/check-tmp` and `<workdir>/check-cache`, so nothing the
agent left in its folders, such as a Jest cache, reaches the checks. The
harness's own git and Biome calls keep the caller's environment.

| Variable | Value |
| --- | --- |
| `TMPDIR`, `TMP`, `TEMP`, `CLAUDE_CODE_TMPDIR`, `XDG_RUNTIME_DIR` | `<workdir>/tmp` (`check-tmp` for the checks) |
| `XDG_CACHE_HOME` | `<workdir>/cache` (`check-cache` for the checks) |
| `npm_config_cache` | `npm/` inside that cache folder |
| `COREPACK_HOME` | the caller's corepack home |
| `PLAYWRIGHT_BROWSERS_PATH` | the caller's Playwright browsers |

`CLAUDE_CODE_TMPDIR` is where Claude Code keeps `claude-<uid>/` and where its
sandboxed commands get their `TMPDIR`, which would otherwise be `/tmp/claude`.
Corepack, the Playwright browsers and the pnpm store stay shared, as in 0034.
The tools add to them when something is missing, and pointing them at the
workdir would fetch pnpm, a browser and every package for each trial. The
CLI refuses a corepack home or browsers folder outside `~/.cache`, so the
allowlist never reaches past what 0034 allowed. The agent's environment no longer takes `TMPDIR`, `COREPACK_HOME`,
`XDG_CACHE_HOME` or `XDG_RUNTIME_DIR` from the caller. The dry run prints the
table. The harness removes nothing outside its workdir; the
orchestrator still removes each workdir.

**A narrower allowlist.** The workdir holds the agent's temp folder, so three
0034 entries go: `<tmp>/claude-<uid>/<clone slug>/`, the tmp entries that
appeared while the agent ran, and the deny on the rest of `claude-<uid>`.
`~/.cache` narrows to the corepack home and the Playwright browsers. The
allowlist is now the workdir, the Claude config entries, the agent's own
session folder, the corepack home, the browsers, the pnpm store and the system
folders. A path the agent names in the real `/tmp`, in the caller's `TMPDIR`
or elsewhere in `~/.cache` fails the run. The prompt already tells the agent
to read only inside its clone.

**No time limit.** No command the harness runs has a time limit: not the
agent, the setup, the commit hooks or the checks. An operator who wants to
stop a trial sends SIGINT or SIGTERM, which stops every process group the
harness started. Before the commit hooks and before the checks, the harness
rewrites the provisional record as a failed run that keeps the agent's exit
code, duration and reads, and names the stage it stopped in, such as `the
harness stopped while the checks ran`. A harness stopped in one of them leaves
a true record.

**Duration as evidence.** The record keeps `run.durationMs` (the whole run),
`run.agentDurationMs` (the agent's session) and each check's `durationMs`.
`validateEvidence` adds two rules. The agent duration is present exactly when
the agent ran to an exit, and is null before the agent starts and in the
provisional record. The run duration equals `finishedAt` minus `startedAt`.
The record's shape is unchanged, so
`schema` stays 1, and `evidence.test.ts` validates every committed
`docs/trials/todo-0N.json` against the new rules.

## Consequences

- Another job's `/tmp` files are not in any trial command's temp folder.
  `run-trial.test.ts` puts a decoy file in the caller's `TMPDIR` and shows
  that the setup, the agent and a check each see a private `os.tmpdir()`
  without it, and that reading the decoy still fails the run. With the
  private env, `pnpm verify` and `pnpm e2e` on this repository made no Node
  file or folder writes under `/tmp`.
- This is isolation by environment, not a sandbox, as with `outsideReads` in
  0034. A command that names `/tmp/<file>` still reaches the shared folder.
  The rule records it and fails the run.
- A trial whose agent writes logs to `/tmp` by habit now fails, where 0034
  let it pass once the entry was new. All three earlier agents wrote logs
  there. A prompt line that names `$TMPDIR` as the place for logs would warn
  the agent, but the prompt's hash is part of the committed comparison's
  baseline, so that line belongs with the next set of trial records.
- A hung agent or check runs until the operator stops it. The evidence shows
  how long each finished trial took, so a slow run shows up there.
- Claude Code places some Unix sockets under its temp folder, and a socket
  path has a length limit of about 104 bytes. A long `--trials-root` could
  pass it. This was not observed; keep the trials root short.
- The private cache starts empty, so tools that cache under
  `XDG_CACHE_HOME`, such as Biome, build that cache again in each trial. With
  a frozen lockfile and the shared store, `pnpm install` does not need
  pnpm's metadata cache.
- The harness files changed, so the harness hash and the enforcement
  revision move and the next trials start a new baseline, as 0034 requires.
- No dependency is added.
