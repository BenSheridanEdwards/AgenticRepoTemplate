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
their own `<workdir>/check-tmp` and `<workdir>/check-cache`. The harness's
own git and Biome calls keep the caller's environment.

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
CLI refuses a corepack home or browsers folder whose real location, symlinks
followed, is outside `~/.cache`, so the allowlist never reaches past what
0034 allowed. The agent's environment no longer takes `TMPDIR`,
`COREPACK_HOME`, `XDG_CACHE_HOME` or `XDG_RUNTIME_DIR` from the caller. The
dry run prints the table. The harness removes nothing outside its workdir;
the orchestrator still removes each workdir.

**The private temp folder is `/tmp`.** A variable only moves the tools that
read it, and agents name `/tmp/<file>` by habit. So each of those commands
runs inside bubblewrap:

```text
bwrap --dev-bind / / --bind <tmp folder> /tmp --bind <workdir> <workdir> [--bind <agent> <agent>] -- <command>
```

The rest of the filesystem is the host's, unchanged. Inside, `/tmp` is the
command's `TMPDIR` folder, so another job's `/tmp` files are out of view, and
a log the agent writes to `/tmp` lands in its workdir. The workdir, and a fake
agent's executable, are mounted back at their own paths, so a trials root
under `/tmp` still works. The checks get `check-tmp` as their `/tmp`, created
just before they run. The agent can reach the workdir, so a check folder that
already exists means the agent wrote there, and the run fails without
running the checks.

Before the setup, the harness runs `true` inside the same wrapper. When
bubblewrap is missing or the kernel refuses it an unprivileged user
namespace, the run fails before the agent starts, with `bubblewrap could not
give the trial a private /tmp` and bwrap's own message. There is no fallback
to the shared `/tmp`. Being a failure from before the agent, it can be
retried with `--retry` once bubblewrap works. Bubblewrap is a system tool,
not a package dependency, as `git` and `lsof` are.

**The allowlist.** The workdir holds the agent's temp folder, and `/tmp` is
that folder inside the wrapper, so three 0034 entries go:
`<tmp>/claude-<uid>/<clone slug>/`, the tmp entries that appeared while the
agent ran, and the deny on the rest of `claude-<uid>`. `/tmp` is allowed in
their place, because every path under it names the trial's own folder, or
its own workdir mounted back. The trials root stays denied, even under
`/tmp`. `~/.cache` narrows to the corepack home and the Playwright browsers.
The allowlist is now the workdir, `/tmp`, the Claude config entries, the
agent's own session folder, the corepack home, the browsers, the pnpm store
and the system folders. A path in the caller's `TMPDIR` or elsewhere in
`~/.cache` fails the run. The rule is as strict as before: it allows nothing
outside the trial's own folders and the shared caches.

**No time limit.** No command the harness runs has a time limit: not the
agent, the setup, the commit hooks or the checks. An operator who wants to
stop a trial sends SIGINT or SIGTERM, which stops every process group the
harness started. Before the commit hooks, before the stray-server sweep and
before the checks, the harness rewrites the provisional record as a failed
run that keeps the agent's exit code, duration and reads, and names the stage
it stopped in, such as `the harness stopped while the checks ran`. A harness
stopped in one of them leaves a true record.

**Duration as evidence.** The record keeps `run.durationMs` (the whole run),
`run.agentDurationMs` (the agent's session) and each check's `durationMs`.
`validateEvidence` adds two rules. The agent duration is present exactly when
the agent ran to an exit, and is null before the agent starts and in the
provisional record. The run duration equals `finishedAt` minus `startedAt`.
The record's shape is unchanged, so
`schema` stays 1, and `evidence.test.ts` validates every committed
`docs/trials/todo-0N.json` against the new rules.

## Consequences

- Another job's `/tmp` files are out of every trial command's view, and the
  agent's own `/tmp` logs stay inside its workdir. Replayed through the
  harness under bubblewrap, the committed `todo-02` and `todo-03` streams,
  each of which wrote and read two logs in `/tmp`, pass with no outside read.
  Their logs land in the private folder and not in the box's `/tmp`. The
  real `claude -p` runs inside the wrapper, and its `/tmp` holds only its own
  entries.
- The R5 trials can reuse the prompt unchanged. No prompt line about
  `$TMPDIR` is needed, so the prompt hash stays.
- A box without working bubblewrap cannot run a trial; it fails early and
  says why. GitHub's Ubuntu runners have no `bwrap`, which is why the tests
  run most commands without it. One test puts a failing `bwrap` on the
  `PATH` and shows the run stops before the agent. Another checks the host:
  with working bubblewrap, the setup, the agent and a check each see their
  own `/tmp` without a decoy left in the real one, and without it, the run
  fails early. CI therefore proves the failure path, and only a box with
  bubblewrap proves the mount.
- This is a mount namespace for `/tmp`, not a full sandbox. The agent can
  still read the rest of the host filesystem, as in 0034; the outside-reads
  rule records and fails those reads.
- The private folders sit beside the clone (`<workdir>/repo`), not inside it.
  ESLint, Biome and TypeScript work from the clone's root and its globs, so a
  `.ts` file a tool writes to `tmp/` or `cache/` is never linted. ESLint
  finds no config for a file outside the clone, so no ignore entry is needed.
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
- No package dependency is added.
