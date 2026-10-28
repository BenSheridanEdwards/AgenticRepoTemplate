# 23. Protect only the files that run the gates

- **Status:** Accepted; superseded in part by
  [0024](0024-sign-off-only-loosening-enforcement-changes.md)
- **Date:** 2026-10-17

## Context

ADR 0007 (now deleted) protected every path
that shapes enforcement: every root config file, `pnpm-lock.yaml`, `.github/**`,
`.claude/**`, `.husky/**`, `scripts/**`, `tooling/**` and the agent docs. That
put most pull requests behind the enforcement sign-off. Dependency updates
waited on it, and so did every change to `.agents/`, which changes all the time.

## Decision

Only the files that run the gates are protected:

- `.husky/**`, the git hooks
- `.github/workflows/**`, the CI workflows
- `eslint.config.js`, `biome.json` and `commitlint.config.ts`, the lint, format
  and commit-message configs
- `tooling/eslint-plugin-policy.js`, the local lint rules
  ([0019](0019-local-eslint-policy-plugin.md)), and
  `scripts/check-suppressions.mjs`, the suppression check

Everything else changes without the enforcement sign-off, including
`package.json`, `pnpm-lock.yaml`, other root config, the rest of `scripts/`,
`.claude/`, the rest of `.github/`, `AGENTS.md`, `CLAUDE.md` and `.agents/`.

This record supersedes the protected-path list in ADR 0007 and replaces
ADR 0018 (now deleted).

## Consequences

- Dependency updates, agent-doc changes and most config changes merge on their
  checks alone.
- A change to another script a workflow or hook runs (`scripts/**`, a
  `package.json` script) or to `tsconfig.json` is not flagged by this check.
  The required gates still run on every pull request, and review of the diff is
  what catches a weakened script.
- `.fallowrc.jsonc` is no longer behind sign-off, so role-map changes show in
  the reviewed diff and the role-diagram freshness check
  ([0014](0014-fallow-owns-architecture-checks.md)).
