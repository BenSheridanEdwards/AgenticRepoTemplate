# External-task trials

These trials ran real issues from a private repository through the same harness (ADR 0048: `--task`, `land: patch`, private `evidenceDir`). The task files, prompts, issue text, patches and streams stay outside this public repository. This page records only issue numbers, outcomes, durations and check results.

Each task ran from the issue text at a pinned revision. The agent changed only the allowed paths, and the harness then ran the repository's own checks (install, typecheck, lint, format, unit tests, three repository gates and, for #2227, a build plus a browser test). A hidden acceptance script judged the issue's pass condition.

| Issue | Agent | Model | Status | Agent time | Run time | Checks (all exit `0`) | Turns / tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #2227 | claude | claude-opus-4-8 | passed | 24 min 43 s | 27 min 6 s | install, typecheck, lint, format, unit tests, gates, build, browser test, acceptance | 128 turns, about $15.80 |
| #2227 | codex | gpt-6.1-sol | passed | 6 min 10 s | 8 min 32 s | the same nine | 2.88M input tokens (2.80M cached), 15.2k output |
| #2062 | claude | claude-opus-4-8 | passed | 4 min 27 s | 6 min 40 s | install, typecheck, lint, format, unit tests, gates, acceptance | 14 turns, about $0.82 |
| #2062 | codex | gpt-6.1-sol | passed | 1 min 18 s | 3 min 32 s | the same seven | 401k input tokens (366k cached), 1.5k output |

Earlier #2227 attempt (Claude, superseded): it failed for two reasons that were not the agent's. The task's allowed paths left out a folder that the repository's own gates require to change along with the issue's code; the agent changed it and said so. And the checks' private TMPDIR made Chromium's singleton socket path 108 bytes, over the 107-byte limit, so every browser test aborted. The task scope and the harness were fixed (ADR 0048), and the task was rerun.

Caveat: the private repository's unit suite has one test known to be flaky under load (it passes when run alone). It did not fail in any of these checks.
