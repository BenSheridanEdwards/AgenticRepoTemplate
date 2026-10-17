# 34. Run Todo trials with one harness and record their evidence

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Implements:** [0008](0008-convert-template-into-the-monorepo.md),
  [0032](0032-api-ui-greeting-and-contract.md)

## Context

The brief asks for three independent agent runs that each build the same Todo
app into `showcase/todo-01..03`. Every run uses the same scaffold revision,
agent instructions and tools, checks, lockfile and brief, in a fresh session
and a clean workspace with no prior result present, and with no human edit or
corrective prompt. Each run records its prompt, scaffold revision, enforcement
revision, agent config, resulting commit and check results. Failed runs are
kept, the full pass count is reported, and no showcase result gets an
exception. [0032](0032-api-ui-greeting-and-contract.md) wrote every gate glob
over `{apps,showcase/*}`. Nothing yet runs a trial, records one, or proves that
a showcase result really falls under every gate.

## Decision

**Showcase layout.** A showcase result has the reference's layout:
`showcase/<id>/web` (`@<id>/web`), `showcase/<id>/api` (`@<id>/api`) and the
generated `architecture.mmd`. A web package depends on its own api (types
only) and `@repo/ui`. No result depends on another.

**Inclusion without per-result exceptions.** No gate config names a result.
`tooling/trial/inclusion.test.ts` proves it on a temporary copy of the
checkout with `showcase/x`, a renamed copy of the reference greeting (never a
Todo), committed on a branch off `main` as a trial would be. It runs each
gate's real tool on the copy and asserts the showcase result is in scope: the
Playwright projects (`--list`), the pnpm workspace and a build of `@x/web`,
the ESLint config (equal to the reference's, every `policy/*` rule on), React
Doctor's project list, the four TypeScript programs (`--listFilesOnly`), Jest
and coverage per result, `pnpm arch:diagram` and `pnpm arch:gate` (which runs
the ADR 0033 structure validator and diagram check), the dependency ADR check and
`fallow audit`. The architecture case asserts the structure validator names
`(reference, x)` and the diagram check counts three diagrams, so a gate that
stops listing showcase results fails it. Seeded violations inside the showcase
result fail ESLint policy, the Biome naming override, the api type check,
`fallow architecture` (a value import of the router, a file in no role), the
structure validator (`missing-role` for a deleted api `domain.ts`), the
dependency ADR check, the suppression check and `fallow audit`. A seeded
`node:crypto` import in the result's api `integrations.ts` passes
`pnpm typecheck` and `pnpm api:check`.

**Workspace globs.** `pnpm-workspace.yaml` lists `showcase/*/web` and
`showcase/*/api` in place of `showcase/*/*`. pnpm reads both the same way, but
React Doctor 0.9.18 expands one `*` per glob and read `showcase/*/*` as the
literal folder `showcase/<id>/*`, so it scanned no showcase result. The
inclusion test fails on the old glob.

**The browser program reads the api's declarations.** The api program
(`tsconfig.api.json`) is composite and writes its declarations to
`.cache/types`, and the browser program (`tsconfig.json`) references it. The
`AppRouter` type import then resolves to those declarations, so api source is
checked once, with Node types, and a `node:` import in `integrations.ts`, where
ARCHITECTURE.md puts Node IO, passes `pnpm typecheck` and `pnpm api:check`.
Before, the browser program followed the import into api source and failed on
it with `TS2307`, a trap every trial would have hit. `pnpm typecheck` runs
`tsc -b --force tsconfig.json`, so the declarations are rebuilt from source
on every run. The browser and domain programs keep their types: web code
still fails on a Node global, and domain code still fails on a Node import.
`pnpm api:report` reads the same `.cache/types`. The inclusion test seeds the
`node:crypto` import in `showcase/x`. One narrow gap follows. A Node type in an
exported api signature, such as a procedure that returns a `Buffer`, reaches
the browser program as a name it cannot resolve, and `skipLibCheck` in
`tsconfig.base.json` turns that name into `any` with no error. Before, the
browser program read api source and failed on it. tRPC sends outputs as JSON,
so a Node type in a procedure output is a bug that no gate now catches. A
check for it, such as a `tsc` run over `.cache/types` with
`skipLibCheck: false`, would be a new gate and belongs in its own change.

**Coverage per result.** `tooling/coverage-by-result.mjs` runs in
`pnpm test:coverage` after Jest and fails when any result is under 80 percent
in lines, statements, functions or branches, so one result cannot hide behind
another. It reads Jest's `json-summary` report. The global threshold stays.

**The fixed prompt.** `tooling/trial/todo-prompt.md`, rendered with `{{ID}}`
and `{{N}}`, quotes the brief word for word and adds the fixed UI contract the
acceptance spec drives (heading `Todos`, field `Title`, button `Add`, list
`Todos`, a checkbox named by the title, `Delete <title>`, an alert on a blank
title). It also states the rules of the ADR 0033 structure validator that a
reference copy would not reveal: each `package.json` equals its reference
package except the name and the dependencies, the result's own specs go in
`web/e2e/`, the result root holds no tool config, symlink or suppression, and
the agent keeps the diagram `pnpm arch:diagram` writes. It tells the agent to
read only inside its clone, and that the page reaches the api through
`/trpc`, as the reference does, because the acceptance spec waits on those
requests. Every trial gets the same template.

**The fixed acceptance spec.** `tooling/trial/acceptance/todo.spec.ts` runs as
the Playwright project `<id>-acceptance` for every showcase result, against
that result's own servers. It drives only the UI contract, uses its own titles
per test and never counts todos.

**Run protocol.** `pnpm trial --trial <n> --scaffold <rev>`
(`tooling/trial/run-trial.mjs`) runs one trial from the checkout that keeps
the evidence:

1. It refuses to start, writing nothing, when `docs/trials/<id>.json` exists
   (unless `--retry` and that file records a failure from before the agent
   started), when any entry is left in the trials root, when free disk is
   under 5 GB, or when port 5173, 3001, 5183 or 3011 is busy.
2. It creates `<trials root>/<id>-<UTC stamp>/`, with a bare `origin.git`
   that holds only the scaffold's history as `main` (its `FETCH_HEAD`, which
   names the invoking checkout, is removed), and a blobless clone of
   it at `repo/` on `trial/<id>`. No other branch of the invoking checkout is
   reachable from the clone. It asserts a clean tree and no `showcase/*`
   result, runs `pnpm install --frozen-lockfile` (which installs the hooks),
   checks that every check's entry point exists in the scaffold, and reads
   `claude --version`. A failure here ends the run before the agent, so
   `--retry` may run it again.
3. It writes the rendered prompt to `prompt.md` in the workdir, then a
   provisional record (`agentExitCode: -1`, failed), so a harness stopped
   mid-session still leaves a final record. It runs, in the clone, with the
   prompt on stdin and a 90 minute limit:
   `claude -p --model opus --permission-mode bypassPermissions --output-format stream-json --verbose --session-id <fresh uuid>`.
   The argv never carries `--resume`, `-r`, `--continue` or `-c`. The agent's
   environment comes from an allowlist: what the shell and the toolchain
   need (`PATH`, `HOME`, the locale, `TMPDIR`, `COREPACK_HOME`, `XDG_*`, the
   proxy and CA variables), `CLAUDE_CONFIG_DIR` and the credential variables
   (`CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_*`, `ANTHROPIC_API_KEY`,
   `ANTHROPIC_AUTH_TOKEN`, and the Bedrock and Vertex ones). So a harness
   started inside a Claude Code session still starts a fresh top-level
   session, and a variable such as `ANTHROPIC_MODEL` or
   `MAX_THINKING_TOKENS` never changes a session unrecorded. Every command
   also loses git's per-repository variables, pnpm's script variables
   (`npm_*`, `INIT_CWD`) and the `node_modules/.bin` folders on the PATH,
   which point back at the invoking checkout. The stream is written to
   `agent.stream.jsonl` and copied, with
   the value of every secret-named variable (`TOKEN`, `KEY`, `SECRET`,
   `PASSWORD`, `CREDENTIAL`, `AUTH`) redacted, to
   `docs/trials/<id>.stream.jsonl`, so it outlives the workdir. The agent
   gets no second prompt: `-p` reads the one prompt from stdin, which then
   closes, and it repairs its own mistakes within the session. SIGINT or
   SIGTERM stops the agent's process group with the harness.
4. It lists every changed path (`<scaffold>..HEAD`, the working tree and
   untracked files, with renames split into a deletion and an addition). A
   path outside `showcase/<id>/` fails the run, and so does a
   `pnpm-lock.yaml` change outside the importer entries of
   `showcase/<id>/web` and `showcase/<id>/api`. A tool call that named a path
   outside the trial's workdir fails the run and is recorded in
   `outsideReads`. The allowlist is the workdir, the Claude config entries
   the agent loads, the agent's own session folders
   (`<config>/projects/<clone slug>/<session id>/`, where Claude Code saves
   large tool output, and `<tmp>/claude-<uid>/<clone slug>/`, where it saves
   background command output), the tmp entries that appeared while the agent
   ran, `~/.cache` (Playwright browsers, corepack), the pnpm store and the
   system folders (`/dev`, `/proc`, `/sys`, `/usr`, `/bin`, `/sbin`, `/lib`,
   `/lib64`, `/etc`). The trials root, the rest of `projects/`, which holds
   earlier session transcripts, and the rest of `claude-<uid>` are denied, and
   the closest root that holds a path decides, so a denied root inside an
   allowed one stays denied. A file or search tool's path argument always
   counts, so a search rooted at an ancestor of the workdir counts. A shell
   word counts when it is absolute, under `~/` or starts with `..`, and
   exists, so URL paths such as `/trpc` and markup never count. Relative
   words resolve from the Bash tool's folder, which starts at the clone and
   follows each `cd` through the calls in order; a `cd` inside `( )` lasts
   until the `)`. The prompt tells the agent to read only inside its clone.
5. It rewinds the clone to the scaffold on `trial/<id>`, keeping the agent's
   tree, so whatever the agent committed, the harness makes the one result
   commit: `showcase/<id>` and the lockfile as
   `feat(showcase): add <id> trial result` with the sign-off trailer and the
   hooks on.
6. It checks the four trial ports again, after the commit hooks, so a server
   the agent started as it exited has had the hooks' run to start. A server the agent
   left on one, such as a detached server from the verify skill's launcher
   that outlived the agent's process group, is stopped (SIGTERM to its
   process group, then SIGKILL) and its port recorded in
   `result.stoppedServers`. A stray server does not fail the run; only one
   that will not stop does, by port. Then it clones that commit into
   `check/` and runs `pnpm install --frozen-lockfile`,
   `pnpm verify`, `pnpm e2e` and `node tooling/architecture/structure.mjs`
   there with `CI=1`, as a pull request runs them: the checks see the commit
   and nothing the agent left in its tree, `test.only` fails, and no stray
   server is reused.
7. A failed run also writes `docs/trials/<id>.patch` (the commits since the
   scaffold plus everything uncommitted), so its code is kept.
8. It writes `docs/trials/<id>.json`, formatted by Biome, into the invoking
   checkout, and prints the workdir. It never deletes the workdir: the
   orchestrator fetches `trial/<id>` from it and removes it before the next
   trial.

`--dry-run` prints the plan (workdir, branch, evidence path, prompt SHA-256,
the exact argv) and starts nothing. `--agent-command <path>` swaps only the
executable for a local script and records `agent.fake: true`; the tests use it,
so CI never calls Claude.

**Evidence schema.** `tooling/trial/evidence.mjs` (`validateEvidence`) parses
a record at the boundary and throws, naming the field, on a missing, mistyped
or unknown field. Its fields: `schema: 1`; `trial` (number, id, branch,
workdir folder name only); `prompt` (template path, template SHA-256, rendered
SHA-256 and text); `scaffold` (rev, `enforcementRev`, lockfile SHA-256);
`harness` (a SHA-256 of `tooling/trial/*.mjs` as run, and whether it equals
the scaffold's copy);
`agent` (cli, version, argv, session id, resolved model from the stream's
init event or null, user config SHA-256, fake); `run` (start, finish and
duration; the agent's exit code and duration, null when the agent never
started and -1 in the provisional record; turns and cost from the result
event or null); `result` (status,
commit, changed paths, `outsideScope`, `outsideReads`, `stoppedServers`,
patch path); `stream`
(the kept stream's path and SHA-256, and `userTextEvents`, the user events
that carry text rather than only tool results); `checks`
(name, command, exit code, duration, last 200 lines of output); `failures`;
`retries` (each earlier attempt's start and failures). A record is `passed`
only with a commit, a kept stream, empty scope and read lists, the four checks `install`,
`verify`, `e2e` and `structure` all at exit 0, and no failure; a `failed`
record names at least one failure.

`enforcementRev` is the last scaffold commit touching `.husky`,
`.github/workflows`, `.claude`, `.fallowrc.jsonc`, `.mcp.json`, `.npmrc`,
`.size-limit.json`, `biome.json`, `commitlint.config.ts`, `eslint.config.js`,
`jest.config.ts`, `jest.setup.ts`, `lighthouserc.json`, the root
`package.json`, `playwright.config.ts`, `pnpm-workspace.yaml`, `scripts`,
`tooling` or a `tsconfig*.json`. The user config SHA-256 covers
`settings.json`, `CLAUDE.md`, `agents/`, `commands/`, `output-styles/`,
`remote-settings.json`, `rules/`, `skills/` and
`plugins/installed_plugins.json` in the Claude config folder, plus the
`mcpServers` entry of `.claude.json`.

**New baseline.** A different scaffold rev, enforcement rev, lockfile hash,
prompt template hash, harness hash, CLI version, resolved model id or user
config hash between the three runs starts a new baseline, and all three run again. The
command keeps the brief's `--model opus` alias; the resolved model id pins
what it meant.

**Failed runs.** Every run counts. A failed run keeps its JSON and patch under
`docs/trials/` and is not landed under `showcase/`. Only a failure from before
the agent started (`run.agentExitCode: null`, such as a missing `claude`
binary or a failed install) may be retried, with `--retry`, which carries the
earlier attempt into `retries`.

**Agent environment.** One box, one trial at a time, the user's own Claude
config, recorded by hash. The orchestrator creates and removes the trial
workdirs. `scripts/enforcement-approval.mjs` `GUARDS` is unchanged, so
`tooling/trial/**` changes without sign-off, as `.fallowrc.jsonc` does.

**Verify skill.** `verify.mjs launch --result <id>` serves any result from its
own packages on its own ports, so a reviewer can drive a showcase result.

## Consequences

- The three trials are one command each, and the evidence lets a reader
  check that the runs share one baseline and stayed in scope.
- A change to any gate config that drops showcase results fails
  `inclusion.test.ts`, and a showcase result under the coverage threshold fails
  by name.
- `outsideReads` is evidence, not a sandbox. It sees file and search tool
  paths and the path words of shell commands. A path a command builds at run
  time (`$(dirname $PWD)`, a variable, a script's own file reads) is not
  detected, and after a `cd` to a folder built at run time (`cd "$DIR"`,
  `cd -`) relative words are left out until the next `cd` to a written path.
  A tmp entry another process creates while the agent runs is allowed with
  the agent's own.
  The agent runs with `bypassPermissions`, so an earlier result in the
  evidence checkout is readable in principle. The pinned origin, the empty trials root and the
  per-trial workdir keep earlier results off every path the agent is pointed
  at; they do not make them unreadable.
- `userTextEvents` is recorded, not judged. Whether the CLI echoes the
  prompt as a user event, and whether a skill it loads arrives as user text,
  was not observed on a real session, so a fixed count could fail a clean
  trial. The kept stream is the proof of one prompt: a reader counts its user
  events and reads each one.
- The project `.mcp.json` starts `npx -y gitnexus` with no version, so if
  the agent loads project MCP servers under `-p` (not observed), that tool's
  version comes from the registry at run time and no hash records it.
  Pinning it changes every developer's MCP setup, so it is left to its own
  change; `enforcementRev` moves when `.mcp.json` does.
- The inclusion test adds about 35 seconds to `pnpm test`, because it runs
  each real tool. Its copy links `node_modules` into the checkout, so it
  runs pnpm with `verify-deps-before-run=false`; pnpm never reinstalls
  through those links.
- Running the checks on a second clone costs one more `pnpm install` per
  trial (hard links from the store, about a minute).
- No dependency is added.
