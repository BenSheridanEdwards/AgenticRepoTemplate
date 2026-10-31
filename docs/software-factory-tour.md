# Software factory tour

A ten-minute, seven-stop inspection of executable engineering standards.
Use this page for screen-sharing; keep the spoken rehearsal separate.
The reference is this repository, not an assertion of customer adoption or measured enterprise outcomes.

**Evidence baseline:** `6d770abee9d9bde51eab6ec0a6d8676bd0efc9c0`, captured on 31 October 2026.
[Ledger and repeat commands](proof/software-factory-tour/README.md) distinguish source,
local runtime, synthetic controls, hosted results and merge configuration.
Read receipts as observations at that revision, not a live status badge for later commits.

## 1. Opening · 0:00–0:45

**Show:** the [operating contract](../AGENTS.md#rules-and-what-enforces-them)
and [quality gate matrix](../.agents/project/QUALITY_GATES.md#gate-matrix).

The repository carries types, lint, tests, architecture rules and review proof.
The value is choosing and integrating tools into the enterprise's engineering
system, then adapting the conventions and boundaries to its own codebase.
A coding agent is one operator of that system, not the system itself.

## 2. Executable conventions · 0:45–2:15

**Show:** [convention-to-enforcer table](../.agents/project/CONVENTIONS.md#enforced-conventions),
[tool ownership](../.agents/project/TECH_STACK.md) and
[the policy rule implementation](../tooling/eslint-plugin-policy.js).
A concrete example is `policy/state-and-effects-in-hooks`: state belongs in
custom hooks, rather than being scattered through components.

| Concern | Owner | Configuration |
| --- | --- | --- |
| Format, imports, general lint | Biome | [biome.json](../biome.json) |
| Policy, React hooks and compiler rules | ESLint | [eslint.config.js](../eslint.config.js) |
| Specialised vendored anti-slop rules | Oxlint | [.oxlintrc.json](../.oxlintrc.json), [provenance](../vendor/anti-slop/UPSTREAM.md) |
| Project checks outside the ESLint plugin | React Doctor CLI | [commands](../package.json) |

**Proof:** [baseline gate output](proof/software-factory-tour/baseline.txt),
[real bad/valid ESLint cases](../scripts/eslint-policy.test.ts), and the
[baseline suite receipt](proof/software-factory-tour/receipts.json).
A recurring review correction can become a tested rule. Judgment and conventions
without a gate remain review responsibilities; this is not universal lint coverage.

## 3. Timing and hooks · 2:15–3:45

**Show:** [pre-commit](../.husky/pre-commit), [pre-push](../.husky/pre-push),
and [actual measurements](proof/software-factory-tour/timings.json).

| Pre-commit step, in order | Median seconds | Maximum of five |
| --- | ---: | ---: |
| `pnpm typecheck` | 4.449 | 6.099 |
| Staged Biome | 1.052 | 2.549 |
| `pnpm lint:anti-slop` | 1.787 | 2.962 |
| `pnpm fallow:audit` | 2.199 | 2.504 |
| `pnpm secret-scan` | 1.016 | 1.336 |

These measurements used a staged source parameter rename, restored after testing.
Each sample launches a fresh process on an installed, already exercised macOS arm64
host. First-in-series and warm medians are preserved; OS caches were not purged.
All observed steps met the **under-30-seconds per step** policy.
[ADR 0062](../.agents/decisions/0062-pre-commit-steps-stay-under-30-seconds.md)
is review-held timing policy, not a stopwatch in the hook.

The Oxlint number includes process startup and its configured specialised workload.
It is **not an ESLint comparison**: files and rule ownership differ and no equivalent
baseline was measured. The [raw step receipts](proof/software-factory-tour/receipts.json)
retain every result. Gitleaks was installed for this run; its local wrapper otherwise
reports a skip, with hosted scanning as the backstop.

Pre-push fetches main, checks each pushed branch contains it, then runs the full
`pnpm verify` and `pnpm e2e`. Use preserved output during the tour rather than
waiting for the whole suite. Baseline local verify took 216.732 seconds and E2E
4.557 seconds; these are separate command times, not a fabricated push duration.

## 4. CI lanes · 3:45–5:00

**Show:** [workflow lanes](../.github/workflows/ci.yml),
[required-gates contract](../scripts/required-gates.mjs) and
[hosted baseline receipt](proof/software-factory-tour/hosted.json).

Quality, Fallow/architecture, tests, build and security run in separate lanes.
E2E depends on unit tests. `Required gates` runs even after a failed dependency
and checks that the expected lanes are present and acceptable.
[Negative aggregate fixtures](../scripts/required-gates.test.ts) reject missing,
failed, cancelled and unexpectedly skipped lanes.

The baseline-head CI and CodeQL runs succeeded; the ledger links the actual runs
and preserves job outcomes. A job's successful execution is distinct from the
status it sets. A clean local run is distinct from GitHub Actions.

**Deliberate beta checks:** `enforcement-approval` and `Visual regression` report
results in testing mode and remain nonblocking. The captured branch protection
requires `Required gates`, while these two checks remain outside the required
checks; the aggregate also excludes `enforcement-approval`.
The read-only [configuration comparison](proof/software-factory-tour/protection.txt)
fails because the source inventory expects Visual regression to be required.
That historical output is preserved exactly as observed. Its mismatch describes
the deliberate beta configuration, rather than a defect or a request to promote
either check. Existing settings remain unchanged; beta exit criteria are unspecified.

## 5. Protect standards · 5:00–6:45

**Show:** the [command guard](../.agents/hooks/block-gate-bypass.sh),
[Claude wiring](../.claude/settings.json), [Codex wiring](../.codex/hooks.json),
[approval workflow](../.github/workflows/enforcement-approval.yml) and
[positive/negative probe receipt](proof/software-factory-tour/probes.json).

The demonstration sends command **text as JSON input** to the guard. It executes
no bypass command. `--no-verify`, `commit -n` and `HUSKY=0` inputs return exit 2;
a legitimate commit input returns 0. [Harness integration tests](../scripts/block-gate-bypass.test.ts)
exercise configured entry points as well as the guard.
[ADR 0027](../.agents/decisions/0027-block-common-hook-bypasses.md) names the scope:
source wiring and tests are proven here; live Claude/Codex trust activation and
arbitrary-shell invulnerability are not.

The approval workflow executes the **default branch's checker**, reading proposed
files as data. In-memory fixtures show an ESLint `error` to `off` rewrite detected,
ordinary prose allowed, a named `BenSheridanEdwards` User tick accepted for its exact
head, another user's tick refused, and a new head reset to waiting.
[The existing regression suite](../scripts/enforcement-approval.test.ts) also checks
forged edits, race conditions and stale events.

These are synthetic approval fixtures, not a human sign-off. The approval status
is deliberately nonblocking during beta testing. Guarded paths are explicit, not every config:
[ADR 0023](../.agents/decisions/0023-protect-only-the-files-that-run-the-gates.md)
leaves the Fallow role map to reviewed diffs and diagram freshness.

## 6. Architecture · 6:45–8:30

**Show:** [role table](../.agents/project/ARCHITECTURE.md#roles),
[generated role diagram](architecture/roles.mmd),
[reference import diagram](../apps/architecture.mmd) and
[Fallow configuration](../.fallowrc.jsonc).

The live Fallow probe copies the committed source and unchanged configuration to a
temporary fixture. Clean source passes. A value re-export from domain to application
fails with the exact `api-domain -> api-application` boundary finding and a cycle.
Restoring the source passes again. [Raw output](proof/software-factory-tour/probes.json)
contains all three results; a missing dependency is not used as rejection proof.

Fallow owns role edges and the [contract rule pack](../tooling/architecture/contract.rules.jsonc).
The [structure checker](../tooling/architecture/structure.mjs) owns result shape and
route co-location; ESLint also owns slice isolation. Type-only imports may cross
roles subject to those restrictions. The baseline does not include proposed tighter
UI type isolation from an unmerged branch.

[Diagram checks](../tooling/architecture/diagram.test.ts) reject stale/missing output
and verify repair convergence. The actual baseline check reports two fresh diagrams.
Architecture and API-report commands are in the ledger, with runtime scope labelled.

## 7. Close · 8:30–10:00

**Show:** the [evidence ledger](proof/software-factory-tour/README.md),
[Definition of Done](../.agents/project/PR_QUALITY.md) and
[hosted setup checklist](../.github/SECURITY.md).

The repeatable method is to identify an enterprise's conventions, encode the useful
ones, put each check at the right point, and preserve human ownership of changes to
the standards. Tools are building blocks. The factory is their working integration.

For this reference, local controls and baseline CI have real receipts. Established
required gates and the two deliberate beta checks remain distinct. Adoption, customer
outcomes and faster delivery are not inferred from a passing repository. Review the
proof and adapt the system to the enterprise rather than copying the example application.
