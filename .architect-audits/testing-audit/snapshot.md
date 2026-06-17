# Snapshot

- Repository: `AgenticProjectTemplate` (agentic-project-template@0.1.0)
- Generated: 2026-06-17T00:00:00Z
- Mode: static (no `--with-run`)
- Graphify output present: no (`noGraphify: true` — components-without-tests check falls back to per-folder heuristics; reduced context for centrality ranking)

## Tooling detected

- Test runner: **Jest** `^29.7.0` (jsdom environment, `@swc/jest` transform, no Babel)
- Component testing library: **@testing-library/react** `^16.1.0` (+ `@testing-library/dom`, `@testing-library/user-event` `^14.5.2`, `@testing-library/jest-dom` `^6.6.3`)
- End-to-end framework: **Playwright** (`@playwright/test` `^1.49.1`)
- Lint stack: **Biome** `^1.9.4` (no ESLint → `eslint-plugin-testing-library` / `eslint-plugin-jest-dom` are not applicable here; their guarantees are unenforced)
- jest-dom matchers loaded via `jest.setup.ts` (`setupFilesAfterEnv`)
- Coverage thresholds configured: global 80% across branches / functions / lines / statements (`jest.config.ts:34-36`)

## File inventory

- Unit/component test files: **1**
  - `src/features/threshold-counter/ThresholdCounter.test.tsx`
- End-to-end spec files: **2**
  - `e2e/app.spec.ts` (behaviour map — one user journey)
  - `e2e/styleproof.spec.ts` (computed-style capture surface; inert unless `STYLEMAP_DIR` set — not a behavioural assertion)
- Test count (requires `--with-run` for an exact figure; static count of `it()` blocks): **3** unit `it` blocks, **1** Playwright `test`

## Query usage distribution

Total Testing-Library `*By*` queries in unit suite: **12**

| Tier | Query | Count | % of all queries |
| --- | --- | --- | --- |
| Priority 1 | `getByRole` (with `name`) | 8 | 66.7% |
| Priority 1 | `getByLabelText` | 0 | 0% |
| Priority 1 | `getByText` | 0 | 0% |
| Priority 2 | `getByAltText` / `getByTitle` | 0 | 0% |
| Priority 3 | `getByTestId` | 4 | 33.3% |

- Priority 1 ratio: **66.7%** (threshold 70%) → just below
- `getByRole` share of Priority 1: **100%** (8/8) → excellent
- `getByTestId` ratio: **33.3%** (ceiling 10%) → over the ceiling
- `container.querySelector` / `document.querySelector`: **0**

## Interaction & async

- `userEvent` calls: **6**; `fireEvent` calls: **0** → userEvent ratio **100%** (threshold 80%)
- `waitFor`: 0 · `findBy*`: 0 · `queryBy*`: 0 · `act(...)` wrapping: 0 · `cleanup`: 0
- All interactions correctly `await`ed against `userEvent.setup()`

## Design & coverage

- Snapshot tests: **0** (no `toMatchSnapshot` / `toMatchInlineSnapshot`) — clean
- `toHaveClass` assertions: **0** (no utility-class coupling) — clean
- Flaky-pattern signals: fixed `setTimeout`/`setInterval` waits **0**; ordering-dependent tests **0**; shared mutable state **0**
- Coverage (static read of committed `coverage/coverage-final.json`, two exercised files only): statements **92.6%** (25/27), branches **100%** (3/3), functions **100%** (9/9)
- `collectCoverageFrom` (`jest.config.ts:27-33`) excludes `src/App.tsx`, `src/main.tsx`, and `src/**/index.ts` — the 80% gate guards a deliberately narrowed surface
- Source units with **no dedicated test file**: `statusForCount` (pure, branchy rule in `useThresholdCounter.ts:19-27`, only exercised transitively through the component), the `useThresholdCounter` hook (no `renderHook` isolation test), `App.tsx`
- Components-without-tests (per-folder heuristic, noGraphify): the single feature `threshold-counter` has a test; `App` does not (but is excluded from coverage by config)
