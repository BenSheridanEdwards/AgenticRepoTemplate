# 99. Pin every Action by commit SHA

- **Status:** Accepted (merged in #271)
- **Date:** 2026-11-01
- **Amended by:** [0113](0113-dependabot-and-the-pin-check-cover-composite-actions.md)

## Context

Action tags can move after review. Security's ART dependency report of
31 October 2026 requires SHA pins before adding dependency caches. Its
follow-up clears CodeQL v4.39.1 and github-script v9.0.0 at specific commits.

## Decision

Pin every remote Action to its full commit SHA and keep a version comment.
Resolve existing tags through GitHub's commits API. Preserve existing pins,
workflow steps, triggers and permissions. Use Security's cleared commits for
cache, download-artifact, CodeQL and github-script.

Schedule weekly Dependabot updates for github-actions with a seven-day
cooldown. Review those PRs through the normal gates and human merge process.
Pass input from privileged events through github-script context or env.
Keep GitHub expressions outside run and script bodies on those events.

## Consequences

Reviewed Action code stays fixed until a reviewed update changes its SHA.
The tooling test checks remote pins, cleared cache/download commits,
privileged script input, the existing permissions and update cooldown.
Dependabot updates need the same approval and checks as other PRs.
