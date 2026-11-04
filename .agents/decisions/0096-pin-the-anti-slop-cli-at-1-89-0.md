# 96. Pin the anti-slop CLI at 1.89.0

- **Status:** Accepted (merged in #270)
- **Replaces:** ADR 0072 (deleted)

## Context

The maintainer asked on 31 Oct 2026 to update the anti-slop pins. This replaces
ADR 0072 (deleted), which pinned both packages at exactly `1.78.0`, and implements the pins in
[Adopt the TypeScript toolchain standard](0073-adopt-the-typescript-toolchain-standard.md).

## Decision

Pin oxlint and @oxlint/plugins to exactly 1.89.0. Keep the vendor bytes,
configuration and React Doctor dependency unchanged. Commit lockfile integrity.
Require a seven-day release age in local installs, lockfile regeneration and CI.
Keep the trusted build list unchanged.

## Consequences

The CLI and plugin API stay on the same version. Install cooldown overrides
are removed from workflows. Revert this change to restore the previous pins.
