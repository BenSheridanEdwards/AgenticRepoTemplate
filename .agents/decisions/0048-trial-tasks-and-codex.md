# 48. Run task-defined trials with Claude or Codex

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-20
- **Amends:** [0034](0034-trial-harness-and-evidence.md), [0038](0038-trial-isolation-and-no-time-limit.md)

## Context

The Todo harness fixes both the task and Claude CLI. Real issues in other
repositories need the same independent sessions, immutable baseline, clean
checks and evidence without publishing private issue text or foreign code.
Codex needs its own stream reader and explicit project hook trust.

## Decision

`--agent claude|codex` defaults to Claude. `--task <path>` accepts an absolute
path outside this repository; its default is `tooling/trial/tasks/todo.json`.
The boundary validator rejects unknown or missing fields with their field names.
Every task names a slug, prompt, allowed path prefixes, setup commands, named
checks and landing mode. Optional fields select result paths, acceptance
commands, ports, enforcement paths, commit message and an absolute evidence
directory. Commands are argv arrays, with no implicit shell. Check and acceptance
commands may expand `{{TASK_DIR}}` and `{{ID}}`; prompts and path prefixes expand `{{ID}}`
and `{{N}}`. Check and acceptance names are unique.

Without a target, the invoking checkout supplies `--scaffold` and Todo's prompt
is read at that commit. A target names a local repository or URL and a full
40-hex revision; its prompt is read from disk relative to the task file or by
absolute path. The bare origin fetches only that revision as main, removes
FETCH_HEAD, and supplies the blobless clone on `trial/<id>`. External targets
use patch landing and require an absolute `evidenceDir` outside the invoking
checkout. The agent receives neither the task file nor acceptance commands in
its prompt. Outside-read auditing denies the task folder; the
check clone runs acceptance commands from that folder after the named checks.
As in 0038, the filesystem outside the private /tmp remains host-visible;
read auditing detects named outside paths and is not a complete sandbox.

Trial numbers remain 1..3. Claude ids are `<name>-0N`; other agents use
`<name>-<agent>-0N`. Allowed prefixes respect path boundaries. Todo alone keeps
the pnpm importer exception; external tasks must explicitly allow lockfiles.
Result paths select changed allowed files, including deletions. The harness
commits with hooks and the existing sign-off trailer. Showcase landing keeps
the existing merge protocol; patch landing keeps a patch on either outcome.
An absolute evidence directory keeps records, streams and patches outside this
checkout. Operators keep private task files and their evidence outside the
public repository.

Codex starts with `exec --json`, prompt on stdin, pinned `-m gpt-6.1-sol`,
approval/sandbox bypass, hook trust bypass, the trusted-project override and
`-C <clone> -`. It starts a fresh thread. Reasoning effort uses the CLI default.
The record resolves model and effort from this thread's own session transcript;
when absent, the model falls back to the pinned argument and records that source.
The adapter records thread id, turn count and token usage, with null dollar cost,
and exposes command inputs and file paths to the existing read and comparison
readers. Claude stream interpretation stays unchanged.

The environment adds only CODEX_HOME, OPENAI_API_KEY, OPENAI_BASE_URL,
OPENAI_ORG_ID and OPENAI_PROJECT. Codex config fingerprints cover config.toml,
AGENTS.md, hooks.json, rules, skills and plugins; credential files are excluded.
Read scope adds those entries and only this session's transcript.
`.codex/hooks.json` runs the unchanged ADR 0027 guard for Bash from any git
subfolder. Codex silently skips project hooks unless project trust and hook
trust are both enabled; the harness passes both and CI remains the backstop.
`.codex` is part of Todo's enforcement revision.

New records use schema 2: task identity and definition hash, target, check names,
landing mode, agent identity, model source, reasoning effort and token usage.
Every named task check and acceptance command must run and exit zero for a pass.
Schema 1 records retain their original validation contract.

Comparison includes only Todo, including schema 1. Agent baseline fields must
match within each agent; across agents those fields may differ because agent
is the variable under test. Every non-agent baseline field must match across
agents. New reports include agent, model, status, both durations and check exit
codes per run. Legacy reports keep their existing rendering and validate the
original scaffold template prefix by its recorded hash when the only addition
is the shared-machine section below; changing the original bytes still breaks
that proof. This preserves committed evidence and its drift assertion.

The Todo prompt adds shared-machine rules: stop only processes started by the
session, by PID, keep git identity out of configuration and leave pushing to the
orchestrator. Its template hash changes. This and the harness/enforcement changes
start a new baseline; the orchestrator reruns all three trials per agent.

Codex 0.163 login shells reset the harness PATH through `/etc/profile`.
In `todo-codex-02` and `todo-codex-03`, searching outside the clone for the
missing toolchain caused outside-path failures. The harness now passes
`-c allow_login_shell=false`. Two small real CLI probes confirmed `/bin/bash -lc`
without it resolved `/usr/bin/node`, while `/bin/bash -c` with it preserved the
harness PATH and resolved the supplied Node 22. No user profile is edited and
outside-read auditing is unchanged.

## Consequences

- Private tasks and their code can stay entirely outside this repository.
- Fake-agent tests exercise Codex streams and external targets without a real
  Claude or Codex session. Real CLI integration remains an orchestrator proof.
- Task commands are trusted operator input and execute on the host, under the
  existing private-temp wrapper; a task file is not a sandbox policy.
- Roll back by reverting this ADR's implementation; schema 1 remains readable.
- No package dependency is added.
