# Evidence ledger and replay

Baseline: `6d770abee9d9bde51eab6ec0a6d8676bd0efc9c0`, observed 31 October 2026.
These are preserved baseline receipts, not a claim that later heads passed.
The delivery PR's checks panel supplies its own exact-head hosted status.
[Audience tour](../../software-factory-tour.md) has the same seven timed stops.

| Claim | Evidence kind | Positive control | Negative control / limit |
| --- | --- | --- | --- |
| Tool concerns have named owners | Source + local runtime | [configs and commands](../../../.agents/project/QUALITY_GATES.md#tool-ownership), [baseline verify](baseline.txt) | Existing [ESLint fixtures](../../../scripts/eslint-policy.test.ts) exercise violating and clean source; only selected conventions are linted |
| Pre-commit checks staged changes | Local runtime | [complete staged hook and each step](receipts.json), five repetitions of a staged source parameter rename | [Hook source](../../../.husky/pre-commit) scopes Biome/gitleaks to staged files; typecheck/Oxlint are wider; Fallow checks touched files |
| Every observed step is under 30 seconds | Measurement, not enforcement | [all samples, first/warm medians, maxima](timings.json) | No observed miss; no cold-machine trial; no equivalent ESLint comparison |
| Full local gates run before push | Source + baseline runtime | [pre-push](../../../.husky/pre-push), `pnpm verify` and `pnpm e2e` [output](baseline.txt) | Baseline command times are not a measured full push. Delivery head is rechecked separately |
| CI runs and aggregates expected lanes | Actual hosted baseline status + synthetic regression suite | [run/job URLs and exact SHA](hosted.json) | [aggregate rejection tests](focused-controls.txt); hosted setup gaps in [protection comparison](protection.txt) |
| Common bypass text is rejected | Actual local guard process | Legitimate commit text returns 0 in [probes](probes.json) | Three bypass strings each return 2; strings are JSON data, never executed |
| Supported harness entry points call the guard | Source + integration tests | [guard tests](focused-controls.txt), [harness docs](../../../.agents/HARNESSES.md) | No live Claude/Codex trust activation is asserted; [known gaps](../../../.agents/decisions/0027-block-common-hook-bypasses.md) remain |
| Guarded lint weakening is detected | Pure checker on synthetic file contents | README prose change produces no problem in [probes](probes.json) | ESLint `error` to `off` produces a guarded lint-config problem; real config unchanged |
| Named-user approval is exact-head | Synthetic pure/core and stubbed API tests | Ben User tick produces success in [probes](probes.json) | Wrong user and new head produce failure; [464 focused tests](focused-controls.txt) include stale, forged and race cases; no real human sign-off claimed |
| Prohibited value imports fail | Real Fallow process on temporary HEAD archive | Clean and restored fixtures exit 0 in [probes](probes.json) | Domain-to-application value re-export exits 1 with exact boundary finding and cycle; config unchanged |
| Architecture diagrams are fresh | Local runtime + synthetic stale fixtures | `diagram.mjs --check` reports two matching diagrams in [receipts](receipts.json) | [diagram tests](focused-controls.txt) exercise stale/missing/extra outputs and regeneration |
| Hosted protection matches source intent | Read-only hosted configuration | Required gates and main freshness are configured in [snapshot](hosted.json) | **Not fully satisfied:** Visual regression and enforcement-approval are absent as required checks. No settings changed |

## Environment and timings

[receipts.json](receipts.json) records commands, exit codes, elapsed seconds, source
head and installed versions. Host: Apple M2 Max, 12 logical CPUs, macOS arm64,
Node 26.12.1; package-manager pin selected pnpm 11.3.0. The repository baseline
uses Biome 2.5.1, ESLint 10.12.0, Oxlint 1.78.0, Fallow 3.33.1 and gitleaks 8.30.1.

Five repetitions ran sequentially per hook order, with a staged rename from `name`
to `displayName` in `apps/api/src/features/greeting/domain.ts`. The change preserved
behaviour and was restored after timing. Biome really checked a staged source file;
this was not an empty-index benchmark. All samples include process startup. The
first sample is first in this series after baseline verification, not cold cache.
No OS caches were flushed. Later samples are labelled warm, not independent hosts.
The typecheck command forces rebuilds. Timings are observations, not universal SLAs.

The baseline passed 56 suites / 2034 tests and 7 E2E tests. Full private logs were
retained; public [baseline.txt](baseline.txt) explicitly labels its verify excerpt.
[focused-controls.txt](focused-controls.txt) preserves the full focused test output.
Other output is retained in the JSON receipts, with ANSI removed and machine paths
replaced. No runtime output has been invented. Fallow's nonblocking empty-zone
warnings remain visible, so this is not a claim that every tool warning is fatal.

## Repeatable commands

From a clean checkout of the evidenced revision, with Node meeting `engines.node`,
pnpm and gitleaks installed:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm e2e
pnpm tour:probe
pnpm exec jest --selectProjects tooling --runInBand --verbose --runTestsByPath \
  scripts/block-gate-bypass.test.ts scripts/enforcement-approval.test.ts \
  scripts/required-gates.test.ts tooling/architecture/boundaries.test.ts \
  tooling/architecture/diagram.test.ts
pnpm exec jest --selectProjects tooling --runInBand --runTestsByPath \
  scripts/eslint-policy.test.ts scripts/lint-severity.test.ts
node tooling/architecture/diagram.mjs --check
pnpm api:check
```

The [replay script](../../../scripts/software-factory-probes.mjs) and its
[integration test](../../../scripts/software-factory-probes.test.ts) are added by this change.
To replay the original
baseline, check out its source revision in a fresh worktree and invoke the script
by its path in this delivery revision. Running it normally from this delivery
checkout instead records that checkout's `HEAD`. It imports checker code from the
current working directory and uses `git archive HEAD`, so its source identity is
explicit. It changes only a temporary fixture and prints real outputs. Existing
repository tests provide the broader rule coverage.

For a change already staged through the ordinary workflow, time each pre-commit
step separately, repeating the sequence five times on the same staged state:

```sh
/usr/bin/time -p pnpm typecheck
/usr/bin/time -p pnpm exec biome check --error-on-warnings --staged --no-errors-on-unmatched .
/usr/bin/time -p pnpm lint:anti-slop
/usr/bin/time -p pnpm fallow:audit
/usr/bin/time -p pnpm secret-scan
```

Keep individual output and exit status, label first-versus-warm runs, and compute
medians from the observed samples. The committed timings used a monotonic process
clock around these commands, not the tools' internal timers.

Read hosted status using an already authorised account; these commands change no
repository setting:

```sh
gh run list --repo BenSheridanEdwards/AgenticRepoTemplate --commit "$(git rev-parse HEAD)"
gh api repos/BenSheridanEdwards/AgenticRepoTemplate/branches/main/protection/required_status_checks \
  | node scripts/required-gates.mjs --protection
node scripts/enforcement-approval.mjs --git origin/main HEAD
```

The protection comparison is expected to fail against the captured configuration.
Its missing Visual regression requirement needs an authorised settings change.
Adding enforcement-approval to merge protection is also an explicit administration
boundary; the source aggregate currently does not require it. Ordinary PR review
and configured status checks remain distinct from actual human approval.
