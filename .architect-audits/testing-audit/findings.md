# Testing audit report

Repository: `AgenticProjectTemplate` · Runner: Jest 29 (jsdom, @swc/jest) · E2E: Playwright · Mode: static (`noGraphify: true`) · Generated 2026-06-17T00:00:00Z

The single existing unit test is genuinely well-written — `getByRole`-led, `userEvent`-driven, behaviour-named, zero snapshots, zero utility-class coupling. The honest weakness of this suite is **surface area, not craft**: exactly one feature is tested, the pure rule explicitly designed for isolated testing has no direct test, and the `getByTestId` share sits over the ceiling. The tooling is correct but its accessibility-lint guarantees are unenforced (Biome, not ESLint) and there is no a11y-assertion library (jest-axe) anywhere in the suite or CI.

---

## Snapshot

# Snapshot

- Repository: `AgenticProjectTemplate` (agentic-project-template@0.1.0)
- Generated: 2026-06-17T00:00:00Z
- Mode: static (no `--with-run`)
- Graphify output present: no (`noGraphify: true` — reduced context; per-folder heuristics only)

## Tooling detected

- Test runner: **Jest** `^29.7.0` (jsdom, `@swc/jest`)
- Component library: **@testing-library/react** `^16.1.0` (+ user-event `^14.5.2`, jest-dom `^6.6.3`)
- End-to-end: **Playwright** (`@playwright/test` `^1.49.1`)
- Lint: **Biome** (no ESLint → testing-library/jest-dom ESLint plugins not applicable)
- jest-dom loaded in `jest.setup.ts`; coverage thresholds 80% global (`jest.config.ts:34-36`)

## Query usage distribution (unit suite, 12 total `*By*` queries)

| Tier | Query | Count | % all |
| --- | --- | --- | --- |
| Priority 1 | `getByRole` (named) | 8 | 66.7% |
| Priority 3 | `getByTestId` | 4 | 33.3% |

- Priority 1 ratio **66.7%** (thr 70%) · `getByRole` share of P1 **100%** · `getByTestId` ratio **33.3%** (ceiling 10%) · querySelector **0**
- `userEvent` **6** / `fireEvent` **0** → **100%** (thr 80%)
- Snapshots **0** · `toHaveClass` **0** · `waitFor`/`act`/`cleanup` **0** · fixed waits **0**
- Coverage on the two exercised files: stmts 92.6%, branches 100%, funcs 100% (`App.tsx`/`main.tsx`/`index.ts` excluded from `collectCoverageFrom`)

---

## Summary

| Layer | present | partial | missing | violation |
| --- | --- | --- | --- | --- |
| Test runner and tooling | 5 | 2 | 0 | 1 |
| Query priority and selector hygiene | 5 | 1 | 0 | 1 |
| Interaction and async patterns | 8 | 0 | 0 | 0 |
| Test design and coverage | 3 | 4 | 0 | 0 |

Status vocabulary: **present** (invariant holds) · **partial** (mostly holds / soft check, mixed) · **missing** (structural prerequisite absent) · **violation** (concrete code breaks the invariant).

---

## Layer 1 — Test runner and tooling

### single-test-runner — present
- Expectation: Exactly one of Vitest or Jest in `devDependencies`.
- Evidence: `package.json:52` declares `jest ^29.7.0` only; no `vitest`. Config at `jest.config.ts`.
- Gap: None.
- Remediation: Keep to a single runner.

### testing-library-react-installed — present
- Expectation: React Testing Library present in a React project that ships tests.
- Evidence: `package.json:43` `@testing-library/react ^16.1.0` (React 19, `package.json:30`).
- Gap: None.

### user-event-installed — present
- Expectation: `@testing-library/user-event` available for interaction simulation.
- Evidence: `package.json:44` `@testing-library/user-event ^14.5.2`; used in `ThresholdCounter.test.tsx:2`.
- Gap: None.

### jest-dom-installed — present
- Expectation: `@testing-library/jest-dom` available for DOM-aware matchers.
- Evidence: `package.json:42` `@testing-library/jest-dom ^6.6.3`.
- Gap: None.

### jest-dom-loaded-in-setup — present
- Expectation: The runner setup file imports jest-dom.
- Evidence: `jest.setup.ts:3` `import '@testing-library/jest-dom';`, wired via `setupFilesAfterEnv` (`jest.config.ts:12`). Matchers `toHaveTextContent` used at `ThresholdCounter.test.tsx:14,26,31,42`.
- Gap: None.

### coverage-thresholds-configured — present
- Expectation: Coverage configuration with explicit line/statement/branch/function thresholds.
- Evidence: `jest.config.ts:34-36` sets `coverageThreshold.global` to `{ branches: 80, functions: 80, lines: 80, statements: 80 }`.
- Gap: None on configuration. See Layer 4 `coverage-thresholds-in-ci` (the gate guards a narrowed surface) and `coverage-enforced-in-ci` (enforcement-point not observable statically).

### eslint-testing-library-and-jest-dom-plugins — partial
- Expectation: `eslint-plugin-testing-library` and `eslint-plugin-jest-dom` installed and enabled (shared with `/linting-audit`).
- Evidence: The project lints with **Biome** (`biome.json`, `package.json:34`), not ESLint. Neither plugin is present, and there is no ESLint config for them to attach to.
- Gap: The class of selector/async/matcher mistakes these plugins catch automatically (`no-node-access`, `prefer-screen-queries`, `no-wait-for-multiple-assertions`, `prefer-find-by`, `valid-expect-in-promise`) is currently unguarded by any linter. The single test happens to be clean, so the risk is latent: it bites the *next* test author, not this one.
- Remediation: Either adopt the Biome-equivalent rules where they exist, or run a thin ESLint pass scoped to `**/*.test.{ts,tsx}` enabling the two plugins. Reported `partial` because the linting concern is primarily `/linting-audit`'s and Biome is a legitimate choice.

### end-to-end-framework-present — present
- Expectation: Playwright or Cypress present.
- Evidence: `package.json:38` `@playwright/test ^1.49.1`; config `playwright.config.ts`; spec `e2e/app.spec.ts`.
- Gap: None at the tooling level. See Layer 4 `critical-path-e2e`.

---

## Layer 2 — Query priority and selector hygiene

### query-distribution-favours-priority-one — partial
- Expectation: >=70% of all `*By*` queries are Priority 1.
- Evidence: 8 of 12 queries (66.7%) are `getByRole`; the other 4 (33.3%) are `getByTestId` (`ThresholdCounter.test.tsx:14,42,46,49`). No Priority 2.
- Gap: 66.7% sits **3.3 points below** the 70% threshold, dragged down entirely by the four `getByTestId('count')` calls. The denominator is tiny (12), so this is a single selector choice rather than a systemic lean.
- Remediation: The `count` element renders visible text (`ThresholdCounter.tsx:17-20`). Replacing `getByTestId('count')` with an accessible query (e.g. naming the count region and using `getByRole`, or `getByText`) moves Priority 1 to 100%.

### get-by-testid-is-rare — violation
- Expectation: <=10% of all queries use `getByTestId`.
- Evidence: 4 of 12 queries (33.3%) use `getByTestId('count')` — `ThresholdCounter.test.tsx:14, 42, 46, 49`.
- Gap: 33.3% is over **three times** the 10% ceiling. `data-testid="count"` (`ThresholdCounter.tsx:17`) is a non-accessible hook the user can neither see nor hear; the underlying `<p>` carries real visible text. Every count assertion currently bypasses the accessibility tree the rest of the suite is careful to use.
- Remediation: Give the count an accessible name (e.g. wrap as a `role="status"`/labelled region, or assert via `getByText`/`getByRole` on the rendered value) and delete the `data-testid`. Single-file change touching `ThresholdCounter.tsx:17` and four lines of the test.

### no-container-queryselector — present
- Expectation: No `container.querySelector` / `document.querySelector` for element lookup.
- Evidence: Zero occurrences in `ThresholdCounter.test.tsx`.
- Gap: None.

### queries-via-screen — present
- Expectation: Queries come from `screen.*`, not a destructured `render` return.
- Evidence: All 12 queries are `screen.getBy*` (`ThresholdCounter.test.tsx:14-50`); `render(...)` return is never captured.
- Gap: None.

### render-return-named-view — present
- Expectation (soft): When captured, the render return is named `view`, not `wrapper`.
- Evidence: The render return is never captured (`render(<ThresholdCounter />)` with no assignment), so no `wrapper` antipattern exists.
- Gap: None.

### by-role-is-dominant-priority-one — present
- Expectation (soft): >=50% of Priority 1 queries are `getByRole` with `name`.
- Evidence: 8/8 (100%) of Priority 1 queries are `getByRole`, each with a `name` option (`{ name: /increase/i }` etc., `ThresholdCounter.test.tsx:21,37-39`) or the `status` role.
- Gap: None — exemplary.

### no-redundant-aria-roles — present
- Expectation: Tests do not assert implicit roles redundantly.
- Evidence: `getByRole('status')` targets the implicit live-region role of `<output>` (`ThresholdCounter.tsx:25`) — a legitimate semantic query, not a redundant `[role=...]` assertion. No `role="button"` assertions on `<button>`.
- Gap: None.

---

## Layer 3 — Interaction and async patterns

### user-event-preferred-over-fire-event — present
- Expectation: >=80% of interactions use `userEvent`.
- Evidence: 6 `user.click(...)` calls, 0 `fireEvent` -> 100% (`ThresholdCounter.test.tsx:24,30,41,44-45,48`); driven by `userEvent.setup()` (`:19,36`).
- Gap: None.

### find-for-elements-not-yet-present — present
- Expectation: `findBy*` for elements that appear later, not `waitFor(() => getBy*())`.
- Evidence: The component updates synchronously on click; the suite asserts directly with `getBy*` and no `waitFor` is used or needed.
- Gap: None.

### query-only-for-absence — present
- Expectation: `queryBy*` only with absence assertions.
- Evidence: No `queryBy*` usage.
- Gap: None.

### waitfor-single-assertion / waitfor-not-empty / no-side-effects-in-waitfor — present
- Expectation: `waitFor` discipline.
- Evidence: No `waitFor` in the suite (0 occurrences), so none of the misuse patterns can occur.
- Gap: None.

### no-unnecessary-act — present
- Expectation: No hand-rolled `act(...)` around `render` / interactions.
- Evidence: Zero `act(` wrappings.
- Gap: None.

### no-manual-cleanup — present
- Expectation: No imported/called `cleanup`.
- Evidence: Zero `cleanup` references; Jest auto-cleanup relied upon.
- Gap: None.

### assertions-are-explicit — present
- Expectation: Tests assert via `expect(...)`, not bare `getBy*` throwing.
- Evidence: Every query feeds an `expect(...).toHaveTextContent(...)` (`ThresholdCounter.test.tsx:14-16,26,31,42,46-50`). No bare-query lines.
- Gap: None.

---

## Layer 4 — Test design and coverage

### tests-describe-user-behaviour — present
- Expectation (soft): Test names describe user-visible behaviour.
- Evidence: `'starts healthy at zero'`, `'warns as it approaches the limit, then reports capacity at the threshold'`, `'never decrements below zero and can be reset'` (`ThresholdCounter.test.tsx:11,18,34`) — all user-observable outcomes, none implementation-named. The Playwright `test` is likewise journey-named (`app.spec.ts:9`).
- Gap: None. (Promoted from the default soft `partial` to `present` because all three names are unambiguously behavioural.)

### no-utility-class-assertions — present
- Expectation: No `toHaveClass` against raw utility classes.
- Evidence: Zero `toHaveClass` assertions in the unit suite; the E2E skill explicitly forbids CSS-class assertions (`run-e2e-tests/SKILL.md:27-30`) and `app.spec.ts` asserts only on `status` text and roles.
- Gap: None.

### snapshots-bounded-and-intentional — present
- Expectation: Snapshots small, intentional, named; none oversized or implementation-coupled.
- Evidence: Zero snapshot tests anywhere.
- Gap: None — the suite avoids the snapshot smell entirely.

### coverage-thresholds-in-ci — partial
- Expectation: The 80% gate guards the real surface.
- Evidence: Thresholds set (`jest.config.ts:34-36`), but `collectCoverageFrom` (`jest.config.ts:27-33`) excludes `src/App.tsx`, `src/main.tsx`, and `src/**/index.ts`. The committed `coverage/coverage-final.json` contains only `ThresholdCounter.tsx` and `useThresholdCounter.ts` — i.e. the gate is computed over **two files**.
- Gap: An 80% global gate over a two-file surface is easy to keep green and gives a misleading sense of safety as the app grows. Excluding `App.tsx` is defensible for a thin shell today, but the exclusion list will silently hide whole features if the pattern is copied. `noGraphify: true` means this audit cannot rank which untested units are most central.
- Remediation: Re-include `App.tsx` (or assert it via the E2E behaviour map and document the exclusion rationale inline), and revisit the exclude list whenever a new top-level surface is added. Reported `partial` — thresholds exist and are real; the concern is the guarded surface, not the absence of a gate.

### coverage-enforced-in-ci — partial
- Expectation (soft): CI fails when coverage regresses.
- Evidence: `coverageThreshold` makes `jest --coverage` exit non-zero on regression, and `test:coverage` (`package.json:22`) wires it. `pnpm verify` (`package.json:25`) runs `pnpm test` (plain `jest`, **without** `--coverage`), so the threshold is *not* enforced in the default verify gate. No CI workflow file was found in this checkout to confirm `test:coverage` runs in CI.
- Gap: The coverage gate exists but the repo's own composite gate (`verify`) runs `jest` without `--coverage`, so a coverage drop would not fail `pnpm verify`. Enforcement therefore depends on a CI step this static checkout cannot observe.
- Remediation: Point `verify` at `test:coverage` (or add an explicit coverage CI job). One-line `package.json:25` change.

### critical-path-e2e — present
- Expectation (soft): At least one Playwright/Cypress spec covers the primary user journey.
- Evidence: `e2e/app.spec.ts:9-28` walks the full healthy->warning->at-capacity->reset journey using `getByRole`. (`styleproof.spec.ts` is a computed-style capture, inert without `STYLEMAP_DIR`, and does not count as behavioural coverage.)
- Gap: None for the one feature that exists. As features are added, each needs its own journey.

### no-flaky-pattern-signals — present
- Expectation: No fixed waits, ordering dependence, or shared mutable state.
- Evidence: Zero `setTimeout`/`setInterval`; each `it` does its own `render` and `userEvent.setup()` (`ThresholdCounter.test.tsx:12,19,36`); no module-level mutable state; Playwright runs `fullyParallel` (`playwright.config.ts:17`).
- Gap: None.

### mocking-at-module-boundaries — present
- Expectation (soft): Mocks at module/network boundaries, not internal helpers.
- Evidence: No mocks at all; the component is tested as a real unit. No internal-helper mocking to penalise.
- Gap: None. (No async/error paths exist to mock — see the coverage-surface notes below.)

### components-have-minimal-coverage — partial
- Expectation (soft): Every user-facing component has at least one referencing test (graph-aware when Graphify present; per-folder heuristic otherwise).
- Evidence (`noGraphify: true`, per-folder heuristic): The one feature component `ThresholdCounter` is tested. **But the thin surface is the headline honest finding of this audit:**
  - `statusForCount` (`useThresholdCounter.ts:19-27`) is a pure, branchy rule whose own docstring says it is "kept separate ... so the business rule can be unit-tested in isolation" — yet it has **no direct unit test**. Its three branches are only exercised transitively through component clicks, which is exactly the isolation the code was structured to avoid.
  - The `useThresholdCounter` hook has **no `renderHook` isolation test**; its `initial`-based `reset` path (`useThresholdCounter.ts:42`) is never exercised with a non-zero initial value (the component always starts at 0).
  - There are **no error-path or async-failure tests** — the feature is synchronous and cannot throw, so this is honest about *this* code, but the suite establishes no pattern for the team to follow when async/error paths arrive.
  - There is **no accessibility-assertion library** (`jest-axe` / `toHaveNoViolations`) anywhere in the suite or CI; a11y is asserted only implicitly via role queries, never scanned.
  - `App.tsx` has no test and is excluded from coverage.
- Gap: One feature, one component test, one E2E journey. The craft is high but the coverage *surface* is a single happy path plus its edges; nothing proves the harness scales to isolated-unit, error-path, or a11y-scan testing.
- Remediation: (a) Add a direct `statusForCount` table test (boundary values 0/3/4/7/8/9) — cheapest, highest-signal. (b) Add a `renderHook` test for `useThresholdCounter` covering `reset` to a non-zero `initial`. (c) Add `jest-axe` and one `toHaveNoViolations(await axe(container))` assertion to lock in a11y. Reported `partial` because the single component genuinely is tested.

---

## Honest bottom line

This is a *correctly built* test, not a *complete* test suite. The patterns are textbook (role-first, userEvent, behaviour-named, no snapshots, no class coupling), and that is worth protecting. The two graded weaknesses are the `getByTestId` ceiling breach (an easy fix that also lifts Priority 1 past 70%) and the unenforced accessibility-lint guarantees. The larger, ungraded-but-flagged truth is **surface area**: a pure rule designed for isolation testing has no isolation test, hooks aren't tested in isolation, there are no error/async-path tests, and a11y is never scanned. None of that is a violation today because the one feature is small and synchronous — but a template's job is to set the pattern, and the pattern currently stops at one happy-path feature.
