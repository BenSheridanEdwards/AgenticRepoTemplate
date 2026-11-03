# 95. Reviewers check each cited PRD behaviour listed in the PR body

- **Status:** Accepted (merged in #269)
- **Date:** 2026-11-01
- **Extends:** [The PR body names its PRDs and North Star commit](0057-pr-body-names-its-prds-and-north-star-commit.md)

## Context

A PR body names the PRDs it checked, but gives reviewers no list of promises
to check against the diff. A valid reference alone cannot show that the change
satisfies those promises.

Ben chose Q5 option (c) on 31 October 2026 at 12:22 GMT: a bot review step
outside CI. He asked to highlight this area for the reviewer in the PR
description. The reviewer supplies the verdict and reasons.

## Decision

Require `PRD Behaviours to Review` as the fifth section, after
`Verification Summary` and before `PR Proof Law` in the template.
For every behaviour of every PRD in `PRDs checked`, use this line:

``- `docs/prd/<feature>.md`: <summary exactly as bolded in the PRD> Evidence: <at least two words>``

Evidence names the test, proof or reason the behaviour is unchanged.
When `PRDs checked` is `None: <reason>`, the section is exactly `- None`.

Keep the summaries from the validator's existing PR-head reads. Check shape,
membership, completeness and duplicates. With a null head, check shape only.
Quote the expected line when a behaviour is missing or repeated.

List every behaviour, including those claimed unchanged. A partial list lets
the author choose which promises receive review. An unchanged claim also
needs checking. The longest PRD currently has five behaviours; keeping the
summaries costs no additional repository read.

Reviewers check each line against the diff and evidence and record `pass` or
`fail` with a one-line reason per behaviour. Request changes on a failure or
evidence that does not prove the promise.

## Alternatives

An LLM in CI would add a model call, credentials and a judgment to the gate.
A deterministic CI verdict cannot establish whether a diff satisfies prose.
Ben chose the review step instead of either option. CI checks the list, and
review supplies the verdict. This adds no workflow, secret or dependency.

## Consequences

Every open PR body needs the section after rollout, including parked PRs.
The orchestrator updates them after Ben merges this change and keeps its
external body templates in sync. Existing bodies fail PR quality until updated.
The reviewer step answers the issue's verdict requirement; an automated
semantic verdict would be a separate proposal.
