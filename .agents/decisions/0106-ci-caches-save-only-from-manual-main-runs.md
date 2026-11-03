# 106. CI caches save only from manual main runs

- **Status:** Accepted (merged in #288)
- **Date:** 2026-11-02

## Context

The setup-node pnpm cache saves from PR jobs. Dependency installation needs a
shared restore policy whose writers run trusted main code.

## Decision

Use the shared setup composite in every CI dependency-install lane. Restore
the pnpm store with keys containing the runner OS, Node version file hash and
lockfile hash. Limit fallback restores to the same OS and Node prefix. Preserve
frozen installs and each lane's build-script policy.

CI still does not run on push. Permit cache writes only from a run Ben starts
by hand on main with the boolean `save_pnpm_cache` input explicitly enabled.
Its default is false. The automated main-tree dispatch leaves it unset.
Require workflow_dispatch, refs/heads/main, explicit opt-in and no exact hit
in the save condition. This is the narrow manual-only exception to the no-push
CI policy: only a maintainer-dispatched run of trusted main may populate stores.

Set the repository variable `PNPM_STORE_DIR` for persistent self-hosted stores.
Configure that directory and bypass both cache restore and save. Report
`pnpm store: hit|partial|miss|persistent (<key>)` in each installing job's summary.
Guard composite actions with the same approval policy as CI workflows and
include them in the trial enforcement paths.

## Consequences

PR runs and automated dispatches restore stores but never save them. Ben must
manually seed a changed lockfile's cache. Persistent runners manage their own
store lifecycle. Keep read-only workflow permissions and full Action SHA pins.
