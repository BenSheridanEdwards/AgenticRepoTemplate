# 86. Console warnings fail tests

- **Status:** Proposed
- **Date:** 2026-10-31

## Context

Jest and Playwright let warnings pass, so a green test can hide a React
warning, a Node deprecation or a browser error. Lint already fails on warnings
in Biome, ESLint and React Doctor.

## Decision

Record `console.warn`, `console.error` and Node process warning events during
each Jest test. Fail in `afterEach` with the recorded messages. Listen on the
original Node process because Jest copies the process object. Drain Node's
next tick before checking, then remove the listener and restore the spies.
A test that expects a console warning mocks that method itself and asserts
the call. Calls swallowed by its mock never reach the guard.

Import Playwright's `test`, `expect` and `Page` through `./fixtures` in the
reference specs and the E2E template. The automatic fixture records page
console warnings, console errors and uncaught page errors, then fails during
teardown for any unexpected message. Declare an expected message through
`expectedConsole` or the test's `expectConsole` helper. Every declared pattern
must match a recorded message, so a stale expectation fails too. The greeting
API-failure test declares only the resource error from its deliberate HTTP 500.

Prove the Jest guard with child runs in Node and jsdom. Prove the browser
guard against the real server with expected-failure tests and one passing
test that declares its error. Keep trial acceptance machinery unchanged.

## Consequences

Warnings now require a fix or a test that explicitly expects them. Console
output at module load sits outside a Jest test's hooks. The browser guard
covers the test's page; workers and other pages have separate lifecycles.
Fallow warning behaviour stays unchanged. Warnings as failures across every
tool remains a target.
