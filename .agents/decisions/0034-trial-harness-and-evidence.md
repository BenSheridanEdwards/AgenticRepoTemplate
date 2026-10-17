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
gate's real tool on the copy: the Playwright projects, the pnpm workspace and
build, the ESLint config (equal to the reference's, every `policy/*` rule on),
the Biome naming override, the four TypeScript programs, Jest and coverage,
`pnpm arch:diagram` and `pnpm arch:gate`, `fallow architecture`, the
dependency ADR check and `fallow audit`. Each gate also fails on a seeded
violation inside the showcase result.

**Coverage per result.** `tooling/coverage-by-result.mjs` runs in
`pnpm test:coverage` after Jest and fails when any result is under 80 percent
in lines, statements, functions or branches, so one result cannot hide behind
another. It reads Jest's `json-summary` report. The global threshold stays.

**The fixed prompt.** `tooling/trial/todo-prompt.md`, rendered with `{{ID}}`
and `{{N}}`, quotes the brief word for word and adds the fixed UI contract the
acceptance spec drives (heading `Todos`, field `Title`, button `Add`, list
`Todos`, a checkbox named by the title, `Delete <title>`, an alert on a blank
title). Every trial gets the same template.

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
   result, then runs `pnpm install --frozen-lockfile`, which installs the hooks.
3. It writes the rendered prompt to `prompt.md` in the workdir and runs, in
   the clone, with the prompt on stdin and a 90 minute limit:
   `claude -p --model opus --permission-mode bypassPermissions --output-format stream-json --verbose --session-id <fresh uuid>`.
   The argv never carries `--resume`, `-r`, `--continue` or `-c`. The agent's
   environment drops every `CLAUDE*` variable except `CLAUDE_CONFIG_DIR`, so a
   harness started from inside a Claude Code session still starts a fresh
   top-level session. The stream is kept as `agent.stream.jsonl`. The agent
   gets no second prompt; it repairs its own mistakes within the session.
4. It lists every changed path (`<scaffold>..HEAD`, the working tree and
   untracked files). A path outside `showcase/<id>/` fails the run, and so
   does a `pnpm-lock.yaml` change outside the importer entries of
   `showcase/<id>/web` and `showcase/<id>/api`. It also fails the run when a
   tool call named a path outside the clone (a file tool's path argument, or
   an absolute path word in a shell command), other than the Claude config
   folder, the pnpm store, `/dev` and the temp folder, and records each one in
   `outsideReads`.
5. It commits `showcase/<id>` and the lockfile as
   `feat(showcase): add <id> trial result` with the sign-off trailer and the
   hooks on, then runs `pnpm install --frozen-lockfile`, `pnpm verify`,
   `pnpm e2e` and `node tooling/architecture/structure.mjs` in the clone.
6. A failed run also writes `docs/trials/<id>.patch` (the commits since the
   scaffold plus everything uncommitted), so its code is kept.
7. It writes `docs/trials/<id>.json`, formatted by Biome, into the invoking
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
`agent` (cli, version, argv, session id, resolved model from the stream's
init event or null, user config SHA-256, fake); `run` (start, finish and
duration; the agent's exit code and duration, null when the agent never
started; turns and cost from the result event or null); `result` (status,
commit, changed paths, `outsideScope`, `outsideReads`, patch path); `checks`
(name, command, exit code, duration, last 200 lines of output); `failures`;
`retries` (each earlier attempt's start and failures). A record is `passed`
only with a commit, empty scope and read lists, every check at exit 0 and no
failure, and a `failed` record names at least one failure.

`enforcementRev` is the last scaffold commit touching `.husky`,
`.github/workflows`, `.claude`, `.fallowrc.jsonc`, `biome.json`,
`commitlint.config.ts`, `eslint.config.js`, `jest.config.ts`,
`playwright.config.ts`, `pnpm-workspace.yaml`, `scripts`, `tooling` or a
`tsconfig*.json`. The user config SHA-256 covers `settings.json`, `CLAUDE.md`,
`agents/`, `commands/`, `output-styles/`, `skills/` and
`plugins/installed_plugins.json` in the Claude config folder, plus the
`mcpServers` entry of `.claude.json`.

**New baseline.** A different scaffold rev, enforcement rev, lockfile hash,
prompt template hash, CLI version, resolved model id or user config hash
between the three runs starts a new baseline, and all three run again. The
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
- `outsideReads` is evidence, not a sandbox. A shell command that leaves the
  clone through a relative path (`cd ../..`) is not detected; the per-trial
  workdir, the pinned origin and the cleanup between trials keep earlier
  results out of reach.
- The inclusion test adds about 30 seconds to `pnpm test`, because it runs
  each real tool.
- No dependency is added.
