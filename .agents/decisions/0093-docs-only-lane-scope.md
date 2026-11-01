# 93. Scope expensive lanes to code changes

Date: 2026-11-01

Status: Accepted

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
