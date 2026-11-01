# 100. Record per-rule lint failures on every pre-commit

Status: Proposed

## Context

Pre-commit stops at the first failed gate. Its terminal output leaves no local
record of which lint rules failed across repeated attempts at the same tree.

## Decision

Record one JSON line per attempt in `.cache/factory-usage/lint-runs.jsonl`.
An EXIT trap saves and restores the hook status. The logger reruns staged Biome
and the configured anti-slop command with JSON reporters, keeping output private.
Group diagnostics by rule with counts and unique file paths. Identify attempts
with `git write-tree`, and include UTC time, branch, HEAD, hook status and totals.

Read agent identity only from `CODEX_THREAD_ID`, `CLAUDECODE` or `CURSOR_AGENT`.
Read model identity only from `CODEX_MODEL` or `ANTHROPIC_MODEL` for that agent.
Keep absent metadata null. These optional caller-supplied values are attribution,
not proof of which process authored a change.

Set `FACTORY_USAGE_LOG=0` to disable collection. Keep logger errors silent and
preserve the gate result. Exempt only the exact pre-commit telemetry trap from
the hook-to-CI command map: CI has no local commit attempt to record.

## Consequences

Logs stay local and ignored by Git. JSON diagnostics include file paths but no
source text. Typecheck, Fallow and secret-scan counts remain future work.
The extra lint runs add latency; measure it against the pre-commit step budget.
