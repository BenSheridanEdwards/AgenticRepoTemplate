# 7. Protect enforcement paths by default

- **Status:** Superseded by [0023](0023-protect-only-the-files-that-run-the-gates.md)
- **Date:** 2026-10-15

## Context

A gate is only as strong as the files that define it. The first enforcement
plan listed a handful of config paths, and the gap review found many more ways
to weaken a gate: `tsconfig.json`, coverage thresholds, the e2e spec list, the
lockfile, Claude settings, skipped tests, suppression comments, and the
guidance docs themselves.

## Decision

Every path that shapes enforcement is protected by default:

- every root config file
- `.github/**`
- `.claude/**`
- `.husky/**`
- `scripts/**`
- `tooling/**`
- `pnpm-lock.yaml`
- the agent docs: `AGENTS.md`, `GUARDRAILS.md`, and `.agents/**`

Content checks also flag:

- new suppression comments (`eslint-disable`, `biome-ignore`, `@ts-expect-error`)
- deleted tests, and tests marked `.skip` or `.only`
- coverage threshold and coverage exclude changes

A change to any of these fails CI at PR time until Ben signs it off.

## Consequences

- An agent that changes the rules is stopped at the PR. Getting past it
  locally would also take disabling both the pre-commit and pre-push gates,
  and CI still runs on the server.
- Fallow config and any Fallow baseline files sit on this list, which is how
  role-map changes reach review ([0014](0014-fallow-owns-architecture-checks.md)).
- Docs-only PRs that touch `.agents/**` go through the same sign-off. That is
  intended, since guidance is enforcement for agents.
- The detector is plan PR 1. It lands right after PR0 as a required,
  blocking check, ahead of every other enforcement PR (see
  [0006](0006-gap-review-decision-set.md)).
