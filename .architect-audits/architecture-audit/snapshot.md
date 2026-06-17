# Snapshot

- Repository: `AgenticProjectTemplate` (agentic-project-template)
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Generated: 2026-06-17T00:00:00Z
- Mode: **static-inspector** (graphify was NOT run — `graphify-out/graph.json` absent)

## Detected stack

- **Meta-framework:** Vite-React (`vite` + `react`/`react-dom` ^19, `@vitejs/plugin-react`). Not Next.js, not Remix.
- **Language:** TypeScript ^5.7 with a strict `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `isolatedModules`). Confirmed TypeScript project.
- **Architectural pattern:** `feature-folders`. Rationale: `src/features/<feature>/` slice with co-located view (`ThresholdCounter.tsx`), hook (`useThresholdCounter.ts`), test (`ThresholdCounter.test.tsx`), and a barrel (`index.ts`); composition root (`main.tsx`) and layout (`App.tsx`) sit above features. This matches `.agents/project/ARCHITECTURE.md` exactly.
- **Monorepo:** No application workspaces. A `pnpm-workspace.yaml` exists but only carries `allowBuilds` trust declarations — there is no `packages/` directory and no workspace globs. Treated as single-package; cross-workspace checks are N/A.

## Shape (computed statically — no graph centrality available)

- **Application source modules (`src/`):** 6 files — `main.tsx`, `App.tsx`, `index.css`, and the four-file `features/threshold-counter/` slice (`ThresholdCounter.tsx`, `useThresholdCounter.ts`, `ThresholdCounter.test.tsx`, `index.ts`).
- **Feature folders:** 1 (`threshold-counter`).
- **Dependency edges (within `src/`, by inspection):**
  - `main.tsx` -> `App.tsx`, `./index.css`, `react`, `react-dom/client`
  - `App.tsx` -> `./features/threshold-counter` (via barrel)
  - `features/threshold-counter/index.ts` -> `./ThresholdCounter`
  - `ThresholdCounter.tsx` -> `./useThresholdCounter`
  - `useThresholdCounter.ts` -> `react`
  - `ThresholdCounter.test.tsx` -> `./ThresholdCounter`, testing-library
- **Directory depth:** deepest application path = `src/features/threshold-counter/*` (depth 3 under repo root). No `../../` or deeper relative imports anywhere in `src/`.
- **File sizes:** largest TS/TSX source is `useThresholdCounter.ts` at 47 lines; `ThresholdCounter.tsx` 46, `ThresholdCounter.test.tsx` 52, `App.tsx`/`main.tsx` 15 each. All far under the 400-line budget. (`index.css` is 152 lines, not TS.)
- **State management:** none beyond React local state (`useState`/`useMemo`/`useCallback`). No Redux/Zustand/Jotai/MobX/Recoil/TanStack Query/SWR in dependencies.
- **God nodes / communities / PageRank / fan-in distribution:** **cannot be computed** — these are graph-derived (`noGraphify: true`). The codebase is too small (1 feature, ~6 source modules) for centrality analysis to be meaningful even if the graph existed.

## Reduced-context caveat (noGraphify)

The SKILL.md names `graphify-out/graph.json` a hard requirement: god-node detection, community comparison, circular-dependency detection, and fan-in/fan-out analysis are graph-only. This run is **static-only**, so every graph-derived check is reported as `missing` with `noGraphify: true` rather than `present`. Absence of a finding here is **absence of evidence, not evidence of absence** — though at this size (6 source files, no cross-feature edges possible) a cycle or god module is structurally implausible.

## Honest scale caveat

This is a deliberately **tiny single-feature template**, not a production app. Boundary discipline, the public-surface (`index.ts`) convention, and the pure-logic/hook/view split are **asserted by the one reference feature and documented in `.agents/project/ARCHITECTURE.md`, but unproven at scale**: there is no second feature to test feature-to-feature isolation, no `src/shared/` layer yet (intentionally — see ARCHITECTURE.md "intentionally omits"), and no cross-feature coupling to measure. Grade the *design intent and the one instance*, not a track record.
