# Superseded Codex Todo runs

These records are kept as evidence. They are not part of `comparison.md`, which reads only the records directly in `docs/trials/`. Each one failed, or was set aside, because of the trial environment, not because of the agent.

| Folder | Run | Status | Why it was superseded |
| --- | --- | --- | --- |
| `.` | `todo-codex-01` | passed | Ran on scaffold `1bda428`, before the harness environment fix. Kept for the record; replaced by the clean-environment run. |
| `.` | `todo-codex-02` | failed (harness environment) | Every check passed (install, verify, e2e, structure: `0`). The run failed only on "named paths outside the clone". Codex ran each command through a login shell (`/bin/bash -lc`), and `/etc/profile` reset PATH to one without Node 22. The agent then looked for Node outside the clone (`which -a node`, `ls /opt`, `export PATH=…/node22/bin`). Fixed in the harness by `-c allow_login_shell=false` (ADR 0048). |
| `.` | `todo-codex-03` | failed (harness environment) | Same cause and the same outcome as `todo-codex-02`. |
| `lost-result/` | `todo-codex-01` | passed | First clean-environment run (scaffold `5cc32ee`). Its result branch was lost to an operator error: the fetch was refused because the superseded run's branch had the same name, and the workdir had already been removed. The record and stream remain; the result was rerun. |
| `registry-drift/` | `todo-codex-01` | failed (registry drift) | Every check passed. The run failed only on "changed outside showcase/todo-codex-01/: pnpm-lock.yaml". The npm registry had since marked `@opentelemetry/sdk-trace-base@2.12.0` deprecated, and `pnpm install` for a new importer wrote that flag into the lockfile. Re-installing Claude's `todo-03` result on the same scaffold with a fresh cache wrote the same line, so the cause is not agent-specific. Fixed by recording the flag in the scaffold lockfile (`5c248c9`). |

Three streams are not committed: those of the superseded `todo-codex-02` and `todo-codex-03` runs, and the `lost-result/` run. In each, the agent listed processes across the whole shared machine (`ps -eo …`), and the output captured other jobs on that machine, including command lines from a private repository. Those streams are kept outside this repository. Their records (and patches, where a run failed) are committed.
