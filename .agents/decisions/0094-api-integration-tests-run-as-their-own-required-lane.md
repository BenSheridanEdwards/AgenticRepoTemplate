# 94. API integration tests run as their own required lane

- **Status:** Proposed
- **Date:** 2026-11-01
- **Builds on:** [Run E2E in parallel and cache Chromium](0091-parallel-e2e-and-browser-cache.md)

## Context

The API's unit tests call procedures in process. Only the browser suite
exercises the real server. The API has no database: its real dependencies
are Node HTTP, the tRPC standalone adapter, Effect schemas and process env.

Ben asked on 31 October for test lanes to run in parallel and for every
layer to be required. Run E2E in parallel and cache Chromium already
supersedes the earlier decision to wait for unit tests.

## Decision

Add a Jest `integration` project for API `*.integration.test.ts` files in
every result. Exclude these files from `api`; unit and coverage commands
select `web api tooling`. Run `pnpm test:integration` once after coverage
in local `verify`, and in the independent API integration tests CI lane.

Start the unchanged API source with Node on an available loopback port.
Pass `PORT` explicitly in the child env. Wait for its startup line and
socket, call it with HTTP, and stop only that test's child after each test.
Cover a trimmed greeting, a blank name, an unknown procedure and invalid
`PORT`. Bound startup, request and shutdown waits.

Unit, integration and E2E lanes have no job-level `needs` or `if`.
Required gates needs all three and rejects a failed integration result.
The contract lane is a separate change and is a separate change.

## Consequences

HTTP and startup failures have their own required result without waiting
for browser setup. Tests release their ephemeral ports and child processes.
There is a short race between reserving a free port and starting the API;
a competing bind fails the test with startup output. Coverage collection,
thresholds and product behaviour stay unchanged.

Numbers through 0093 were occupied on main, so this record uses 0094
instead of the plan's reserved 0090.
