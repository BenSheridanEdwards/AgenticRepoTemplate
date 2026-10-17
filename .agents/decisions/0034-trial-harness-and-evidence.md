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
`fallow audit`. Seeded violations inside the showcase result fail ESLint
policy, the Biome naming override, the api type check, `fallow architecture`
(a value import of the router, a file in no role), the dependency ADR check, the
suppression check and `fallow audit`.

**Workspace globs.** `pnpm-workspace.yaml` lists `showcase/*/web` and
`showcase/*/api` in place of `showcase/*/*`. pnpm reads both the same way, but
React Doctor 0.9.18 expands one `*` per glob and read `showcase/*/*` as the
literal folder `showcase/<id>/*`, so it scanned no showcase result. The
inclusion test fails on the old glob.

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
the agent keeps the diagram `pnpm arch:diagram` writes. Every trial gets the
same template.

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
   that holds only the scaffold's history as `main`, and a blobless clone of
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
   environment drops every `CLAUDE*` variable except `CLAUDE_CONFIG_DIR` and
   the credential switches (`CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_*`),
   so a harness started inside a Claude Code session still starts a fresh
   top-level session. Every command also loses git's per-repository
   variables, pnpm's script variables (`npm_*`, `INIT_CWD`) and the
   `node_modules/.bin` folders on the PATH, which point back at the invoking
   checkout. The stream is kept as `agent.stream.jsonl`. The agent gets no
   second prompt; it repairs its own mistakes within the session. SIGINT or
   SIGTERM stops the agent's process group with the harness.
4. It lists every changed path (`<scaffold>..HEAD`, the working tree and
   untracked files, with renames split into a deletion and an addition). A
   path outside `showcase/<id>/` fails the run, and so does a
   `pnpm-lock.yaml` change outside the importer entries of
   `showcase/<id>/web` and `showcase/<id>/api`. A tool call that named a path
   where an earlier result can live (the checkout that keeps the evidence,
   the trials root, or the Claude config folder outside the entries the agent
   loads, which holds earlier session transcripts) fails the run and is
   recorded in `outsideReads`. A file tool's path argument always counts; a
   shell word counts when it is an absolute path that exists, so URL paths
   such as `/trpc` and markup never count.
5. It rewinds the clone to the scaffold on `trial/<id>`, keeping the agent's
   tree, so whatever the agent committed, the harness makes the one result
   commit: `showcase/<id>` and the lockfile as
   `feat(showcase): add <id> trial result` with the sign-off trailer and the
   hooks on.
6. It clones that commit into `check/` and runs `pnpm install --frozen-lockfile`,
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
commit, changed paths, `outsideScope`, `outsideReads`, patch path); `checks`
(name, command, exit code, duration, last 200 lines of output); `failures`;
`retries` (each earlier attempt's start and failures). A record is `passed`
only with a commit, empty scope and read lists, the four checks `install`,
`verify`, `e2e` and `structure` all at exit 0, and no failure; a `failed`
record names at least one failure.

`enforcementRev` is the last scaffold commit touching `.husky`,
`.github/workflows`, `.claude`, `.fallowrc.jsonc`, `biome.json`,
`commitlint.config.ts`, `eslint.config.js`, `jest.config.ts`,
`playwright.config.ts`, `pnpm-workspace.yaml`, `scripts`, `tooling` or a
`tsconfig*.json`. The user config SHA-256 covers `settings.json`, `CLAUDE.md`,
`agents/`, `commands/`, `output-styles/`, `skills/` and
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
- `outsideReads` is evidence, not a sandbox. It sees file tool paths and
  absolute shell paths. A shell command that leaves the clone through a
  relative path (`cd ../..`) is not detected, and the agent runs with
  `bypassPermissions`, so an earlier result in the evidence checkout is
  readable in principle. The pinned origin, the empty trials root and the
  per-trial workdir keep earlier results off every path the agent is pointed
  at; they do not make them unreadable.
- The inclusion test adds about 35 seconds to `pnpm test`, because it runs
  each real tool. Its copy links `node_modules` into the checkout, so it
  runs pnpm with `verify-deps-before-run=false`; pnpm never reinstalls
  through those links.
- Running the checks on a second clone costs one more `pnpm install` per
  trial (hard links from the store, about a minute).
- No dependency is added.
