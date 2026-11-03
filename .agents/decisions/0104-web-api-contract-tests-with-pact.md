# 104. Web-API contract tests with Pact

- **Status:** Accepted (merged in #285)
- **Date:** 2026-11-02
- **Amends:** [API integration tests run as their own required lane](0094-api-integration-tests-run-as-their-own-required-lane.md)

## Context

The web's typed handler fakes skip HTTP. The shared AppRouter type cannot check
the batch request and response envelopes on the wire. Ben chose Pact over an
in-repo contract implementation on 31 October: use the existing tool.

## Decision

Pin the devDependency `@pact-foundation/pact` to 17.1.4. Use Pact V4 without
plugins. The consumer calls the same createTrpcClient/httpBatchLink as the app.
The provider verifies the generated pact against server.ts over real HTTP.
Record valid and blank greeting inputs, including the batch error envelope.

Run unit, contract, integration and E2E lanes in parallel. Required gates needs
all four. Within the contract lane, the consumer writes before the provider
verifies. A fixture with the wrong greeting must fail provider verification.
Keep generated pacts in PACT_DIR or the OS temporary directory, outside source.
Use an ephemeral port and terminate only the provider test's own child process.

## Package conditions

The dated clearance of 31 October 2026 12:41 GMT covers Pact 17.1.4,
pact-core 20.2.0, its seven optional platform packages at 20.2.0 and
@scarf/scarf 1.4.0 with its build denied. Override pact-core to 20.2.0.
Core's install script is empty; its binary arrives in the optional platform
package. Give neither Core nor its platform packages an allowBuilds entry.

Deny Scarf's postinstall explicitly with allowBuilds false and set the root
scarfSettings.enabled to false. Set SCARF_ANALYTICS=false and
PACT_DO_NOT_TRACK=true in the local command and CI. Preserve these environment
variables and PACT_DIR through Jest's allowlisted setup. Leave both Pact
prebuild-location variables unset. Download no plugins during tests.

Keep the release-age floor and use frozen installs. The separate package scan
completed before installation in thread mcp:ca379ada-032c-484a-9772-cc1652cffae1:
all versions exceed seven days; registry signatures and integrity hashes exist,
and Pact packages advertise provenance. Scarf and follow-redirects have no
provenance metadata. The baseline audit has fourteen advisory IDs, none high.
Run the high-severity audit and compare advisory IDs after installation.
Use the approved follow-redirects 1.16.2 override to fix its high advisory.

Patch http-proxy 1.18.1 through pnpm patchedDependencies: replace only its two
util._extend bindings with Object.assign. Pact's verifier otherwise emits a
Node deprecation warning, which the test harness rejects. The contract gate
checks the real provider output for DEP0060. Remove this patch when upstream
drops util._extend.

## Consequences

Pact adds prebuilt native packages and lockfile entries. A package-only change
would fail the unused-dependency gate; the contract layer needs the package.
The api-client public barrel and API report stay fixed. Product behaviour,
E2E specs and coverage rules stay fixed.
