# 72. Stabilize trial installs and check scope per brief

- **Status:** Proposed
- **Date:** 2026-10-26
- **Amends:** [0034](0034-trial-harness-and-evidence.md), [0035](0035-trial-comparison.md), [0071](0071-a-second-trial-brief.md)

## Context

The trial on scaffold `88d5539` failed: 4/12 builds changed lockfile entries
outside their importers. `@paulirish/trace_engine@0.0.53` declares two `latest`
specs; adding importers resolved `legacy-javascript` from locked 0.0.3 to
0.0.4, published 23 October at 20:11 UTC. Notes comparison needed a scratch edit.

## Decision

Pin `legacy-javascript` and `third-party-web` to locked 0.0.3 and 0.30.0.
`pnpm check:lockfile`, in verify and CI quality, installs a disposable copy,
adds two reference-shaped showcase importers and installs again. Fail on drift
outside those importers using the harness's unchanged filter; keep audit enabled.
Both prompts require `node tooling/trial/check-scope.mjs --id <id>` during
the session; both tasks run it after clean-checkout checks. Reuse `inspectChanges`
against `origin/main` (or `--scaffold <rev>`). Preserve `outsideScope` and carry
its failures into the named scope check, including files omitted from the commit.
Compare accepts `--brief todo|notes`, default Todo, selecting records, facts,
prompt and baseline. Notes writes `docs/trials/notes-comparison.md`; Todo retains
its report path and rendering. Preserve historical evidence.

## Consequences

Behavioural tests prove install drift, scope failures and both comparison CLIs.
Verify/CI quality each cost two extra disposable installs. The changed prompt,
harness and lockfile require a new shared trial baseline. No dependency or tool
owner changes; reverting this PR restores prior behavior.
