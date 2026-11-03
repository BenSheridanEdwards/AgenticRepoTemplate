# 93. Scope expensive lanes to code changes

- **Status:** Accepted
- **Date:** 2026-11-01
- **Amended by:** [0111](0111-grade-docs-only-pull-requests-on-their-gates.md)

## Context

Documentation changes spend time installing and running application checks.
The tested docs-only classifier excludes executable inputs and generated reports.

## Decision

Run the classifier after checkout in test, coverage, build, e2e, Fallow and
CodeQL. Keep each job reporting success while gating its remaining work.
CodeQL push and scheduled runs always analyse. Keep quality, tooling, security,
branch freshness and Required gates running. Enforce step conditions in the
required-gate contract and keep aggregate decisions fail closed.

Confidence uses empty coverage data only for changes classified by the trusted
script as docs-only. Code changes retain unavailable-coverage blocking.

## Consequences

Docs-only lanes cost checkout and classification. Unknown inputs run full work.
No browser or dependency installation is needed in those skipped lanes.

## Reader audit

- Test reads source tests and fixtures; exclude result and package trees.
- Coverage reads coverage JSON, source paths and PRD mappings; confidence still runs.
- E2E reads result behaviour maps and trial acceptance fixtures; exclude both.
- Build reads source and public assets; no prose bundling is configured.
- Fallow reads code and configuration; architecture and API checks also read generated reports, which remain excluded.
- CodeQL reads JavaScript and TypeScript; docs permits only Markdown and text.

Unknown events, missing bases, empty diffs and either executable side of a rename
run full checks. Prefix and segment exclusions include hidden paths: globstar
matching can skip dot segments. Only evidence uploads may combine failure or
always with scope. Summary steps only echo to the summary file; scope steps run
the classifier itself. Other steps require the exact scope condition.
