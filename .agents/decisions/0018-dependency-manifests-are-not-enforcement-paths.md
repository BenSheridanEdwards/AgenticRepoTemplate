# 18. Dependency manifests are not enforcement paths

- **Status:** Superseded by [0023](0023-protect-only-the-files-that-run-the-gates.md) and
  [0024](0024-sign-off-only-loosening-enforcement-changes.md)
- **Date:** 2026-10-17

## Context

[ADR 0007](0007-protect-enforcement-paths-by-default.md) protected every root
config file and `pnpm-lock.yaml`. That put every dependency update behind the
enforcement sign-off: each Dependabot PR and each toolchain bump waited for Ben
to tick the box, though none of them changes what a gate checks.

## Decision

- **`package.json` and `pnpm-lock.yaml` are not protected.** A change to either
  no longer needs the enforcement sign-off.
- **Everything else in ADR 0007 stays protected:** other root config files,
  `.github/**`, `.claude/**`, `.husky/**`, `scripts/**`, `tooling/**` and the
  agent docs.

[ADR 0023](0023-protect-only-the-files-that-run-the-gates.md) replaces the
protected-path list this record amended. `package.json` and `pnpm-lock.yaml`
stay outside the gate, and [ADR 0024](0024-sign-off-only-loosening-enforcement-changes.md)
keeps them there.

This record supersedes the `pnpm-lock.yaml` line and the `package.json` part of
"every root config file" in ADR 0007.

## Consequences

- Dependabot and toolchain PRs merge on their checks alone.
- A change to a `package.json` script that a gate runs (`verify`, `lint:policy`,
  `test`) is not flagged by this check. The required gates still run on every
  PR, and review of the diff is what catches a weakened script.
