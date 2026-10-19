# 42. Test child processes get an allowlisted environment

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-19
- **Builds on:** [0028](0028-pre-push-runs-the-full-local-gate-suite.md)

## Context

Many tests start git, node or a gate script as a child process. A child
process copies the environment of the Jest run, so it also gets every variable
of whatever started Jest: a git hook, a CI job, or an agent session. Each time
one of those variables reached a test's child, the test misbehaved, and each
fix filtered one more name out in that one test file:

- `187741a7` (#86): a hook in a linked worktree exports `GIT_DIR`, and tests
  that build scratch repositories wrote into the repository being pushed.
  ADR 0028 clears git's per-repo variables in `.husky/pre-push`, which covers
  that hook only.
- `980acfd9` (#88): `scripts/check-sign-off-docs.test.ts` inherited `GIT_DIR`,
  so its fixture repository wrote into the hook's repository. The fix dropped
  `GIT_*` in that file.
- `5431c8f7` (#92): `tooling/trial/inclusion.test.ts` already dropped `GIT_*`
  and `JEST_*`, but `GITHUB_BASE_REF` from the pull request run reached
  `check-dependency-adr`, and CI run 39072988181 failed. The fix added
  `GITHUB_*` to that file's list.

Five test files held their own filter, each with a different list. An agent
copies the nearest example, so the next test either copies one of those lists
or passes no `env` at all.

## Decision

- `scripts/jest-global-setup.mjs` is Jest's `globalSetup`. It runs once in the
  Jest parent before any worker starts and keeps only the variables in
  `INHERITED_ENV`: the shell, locale, temp folder, proxy, certificate, Node
  options, pnpm, Corepack, XDG and Playwright browser variables. `NODE_OPTIONS`
  and `VSCODE_INSPECTOR_OPTIONS` stay so a memory limit or a debugger still
  reaches Jest's own workers. Every worker, every test's
  `process.env` and every child process start from that environment.
- A test that needs another variable passes it in `env`, as the tests that set
  a git identity already do.
- The five per-file filters go. `inclusion.test.ts` deletes `JEST_WORKER_ID`
  alone, because jest-worker sets it on each worker after the global setup,
  and Playwright refuses to run under it.
- `scripts/jest-env.test.ts` starts a child process and fails on any variable
  outside the list. GitHub Actions sets `GITHUB_*` and `CI` for every job, so
  in CI the test fails whenever the setup is missing. The same holds under a
  hook or an agent session.

### Proof on the real mistakes

With the setup replaced by a no-op, which is how main behaves:

- `scripts/check-sign-off-docs.test.ts` without its filter (the `980acfd9^`
  shape) fails its CLI tests under a hook's `GIT_DIR`. With the setup it
  passes.
- `tooling/trial/inclusion.test.ts` with the `5431c8f7^` filter fails under
  `GITHUB_BASE_REF=main` on the same two tests CI run 39072988181 failed. With
  the setup it passes.

### Alternatives considered

- **A lint rule that requires `env` on every child process call in tests.** It
  needs an edit to `eslint.config.js`, a guarded file, and every call site
  would still build its own environment, so a list could still miss a name.
- **One shared filter helper that each test imports.** A test that forgets the
  import still inherits everything. The global setup needs no call site.
- **A denylist of `GIT_*` and `GITHUB_*`.** Each fix above was a denylist that
  missed one name. An allowlist also keeps an agent session's own variables
  out of the tests.

## Consequences

- A test runs the same under a hook, in CI and in an agent session.
- `CI` reaches no test. A test that checks CI behavior sets `CI` in its child's
  `env`, as `tooling/trial/system.mjs` does for trial checks.
- A new tool that needs a variable to start goes into `INHERITED_ENV`. The
  setup drops a missing name without a message, so the first sign is that
  tool's own error in the test that runs it.
- The names match as Linux and macOS spell them, which covers CI's
  `ubuntu-latest` runners.
- `.husky/pre-push` still clears git's per-repo variables before `pnpm verify`,
  because the other gates in `pnpm verify` run outside Jest.
