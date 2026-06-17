# Architecture audit report

A tiny, single-feature Vite-React + TypeScript template that scores **clean on every assessable invariant**: feature-folder pattern with a single `index.ts` public surface, a textbook pure-logic / hook / view split, zero circular or deep imports, zero direct IO in components, and a single (React-local) state strategy. The honest ceiling is **scale**: with one feature there is no cross-feature coupling to measure, no `src/shared/` layer yet, and the boundary discipline is asserted-and-documented rather than proven across many slices. Run was **static-only** (graphify not run), so all graph-derived checks (god nodes, cycles, fan-in/out, communities) are `missing`, not `present`.

## Snapshot

- Repository: `AgenticProjectTemplate` (agentic-project-template)
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Generated: 2026-06-17T00:00:00Z
- Mode: **static-inspector** (graphify was NOT run — `graphify-out/graph.json` absent)
- Meta-framework: Vite-React (`vite` + `react`/`react-dom` ^19, `@vitejs/plugin-react`).
- Language: TypeScript ^5.7, strict `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`).
- Architectural pattern: `feature-folders` — `src/features/<feature>/` slice with co-located view/hook/test/barrel; `main.tsx` + `App.tsx` compose above. Matches `.agents/project/ARCHITECTURE.md`.
- Monorepo: No. `pnpm-workspace.yaml` carries only `allowBuilds`; no `packages/`. Cross-workspace checks N/A.
- 6 application source modules in `src/`; 1 feature folder (`threshold-counter`). Deepest path depth 3; no `../../` or deeper relative imports. Largest TS/TSX source 52 lines (all under the 400 budget). State: React local only.
- God nodes / cycles / fan-in distribution: **not computable** (`noGraphify: true`); also structurally implausible at 6 modules.

> Full snapshot in `snapshot.md`.
> **noGraphify caveat:** graph-derived checks are reported as `missing`, not `present`. Absence of a finding is absence of evidence, not proof of cleanliness.
> **Scale caveat:** boundary discipline and the public-surface convention are demonstrated by **one** reference feature and documented in ARCHITECTURE.md — unproven at scale.

---

## Status tally

| Layer | present | partial | missing | violation |
| --- | --- | --- | --- | --- |
| Module boundaries | 2 | 0 | 2 | 0 |
| Coupling & complexity | 2 | 0 | 3 | 0 |
| State & data flow | 4 | 0 | 1 | 0 |
| Convention adherence | 3 | 1 | 0 | 0 |
| **Total** | **11** | **1** | **6** | **0** |

`missing` here means *the check could not be evaluated* — either because it requires the graph (`noGraphify`) or because the structural prerequisite does not exist yet at this size (e.g. no second feature, no layered structure, no App Router). None of the `missing` entries indicate a defect.

---

## Layer 1 — Module boundaries

### no-circular-dependencies — missing
- **Expectation:** the dependency graph is acyclic; cycles detected by graphify.
- **Status: missing** (`noGraphify: true`). Cycle detection is a graph operation and graphify was not run.
- **Static read:** by inspection the import graph is a strict tree (`main -> App -> features/threshold-counter (barrel) -> ThresholdCounter -> useThresholdCounter`). No back-edge exists; a cycle is structurally impossible across 6 modules with this shape. But this is asserted by reading, not proven by the graph.
- **Evidence:** `src/main.tsx`, `src/App.tsx`, `src/features/threshold-counter/index.ts`, `src/features/threshold-counter/ThresholdCounter.tsx`, `src/features/threshold-counter/useThresholdCounter.ts`.
- **Remediation:** run `/pre-audit-setup` to build `graphify-out/graph.json`, then re-run for a confirmed result.

### feature-single-entry-point — present
- **Expectation:** each feature under `src/features/` exposes a barrel (`index.ts`) and external imports go through it.
- **Status: present.** `src/features/threshold-counter/index.ts` exists and re-exports the public component. The only external importer, `src/App.tsx:1`, imports `from './features/threshold-counter'` (the barrel) — not a deep path.
- **Evidence:** `src/features/threshold-counter/index.ts:1`; `src/App.tsx:1`.
- **Gap:** none — but proven for exactly **one** feature with exactly **one** external consumer. Discipline at scale is unobserved.

### no-deep-relative-imports — present
- **Expectation:** relative imports go up at most two levels.
- **Status: present.** Grep for `../../../` (and deeper) across `src/` returns zero matches. All intra-feature imports are single-level siblings (`./useThresholdCounter`, `./ThresholdCounter`).
- **Evidence:** `src/features/threshold-counter/ThresholdCounter.tsx:1`; `src/features/threshold-counter/index.ts:1`; `src/App.tsx:1`.

### no-back-imports-across-boundaries — missing
- **Expectation (feature-folders):** sibling features import each other only through public entry points.
- **Status: missing.** Prerequisite absent — there is only **one** feature, so there are no sibling features to cross. The invariant cannot be exercised.
- **Evidence:** `src/features/` contains a single child, `threshold-counter/`.
- **Note:** the rule is correctly documented in `.agents/project/ARCHITECTURE.md` ("Features are islands… only from its `index.ts`"), so the intent is in place; it is simply untested.

### cross-workspace-contracts — missing
- **Status: missing / N/A.** Not a monorepo (no `packages/`, no workspace globs). Skipped per SKILL.md.

---

## Layer 2 — Coupling and complexity (thresholds: godModule 30, godComponent 25, fileSize 400, fanOut 15)

### no-god-module — missing
- **Expectation:** no module has fan-in > 30.
- **Status: missing** (`noGraphify: true`). Fan-in/PageRank are graph-derived. With 6 modules the maximum possible fan-in is trivially small, so a god module cannot exist at this size, but the metric itself was not computed.
- **Remediation:** re-run after `/pre-audit-setup`.

### no-god-component — missing
- **Expectation:** no component rendered by > 25 parents.
- **Status: missing** (`noGraphify: true`). `ThresholdCounter` has exactly one rendering parent (`App.tsx`); structurally far below threshold, but the render-graph was not built.

### file-size-budget — present
- **Expectation:** no source file exceeds 400 lines.
- **Status: present.** Largest TS/TSX source is `src/features/threshold-counter/ThresholdCounter.test.tsx` (52 lines); `useThresholdCounter.ts` 47; `ThresholdCounter.tsx` 46; `App.tsx`/`main.tsx` 15. (`src/index.css` is 152 lines but is not a TS source.)
- **Evidence:** `wc -l` over `src/**/*.{ts,tsx}` — all <= 52.

### component-fan-out-budget — missing
- **Expectation:** no component imports more than 15 modules.
- **Status: missing** (`noGraphify: true`). Static read: `ThresholdCounter.tsx` imports 1 module (`./useThresholdCounter`); `App.tsx` imports 1. Both trivially under budget, but the per-component import graph was not built.

### no-orphaned-files — missing
- **Expectation:** every source file reachable from an entry point.
- **Status: missing** (`noGraphify: true`). Reachability is a graph traversal. Static read: every `src/` module is reachable from `main.tsx`; no orphans by inspection — but this was not confirmed against the graph.

---

## Layer 3 — State and data flow

### single-state-management-strategy — present
- **Expectation:** exactly one state strategy.
- **Status: present.** `package.json` declares no state library (no Redux/Zustand/Jotai/MobX/Recoil/Valtio). State is React-local only: `useState`, `useMemo`, `useCallback` in `useThresholdCounter.ts`. Single, coherent strategy.
- **Evidence:** `package.json` dependencies (`react`, `react-dom` only); `src/features/threshold-counter/useThresholdCounter.ts:1,38-44`.

### data-fetching-layer-separated — missing
- **Expectation:** server state lives in a designated data layer, not component `useEffect`+`fetch`.
- **Status: missing.** Prerequisite absent — there is **no** data fetching anywhere. Grep for `fetch(`/`axios`/`XMLHttpRequest` in `src/` returns zero matches. The check has nothing to evaluate. ARCHITECTURE.md explicitly defers a data layer ("No router, store, data layer, or backend… give each its own boundary when you add them"), so the omission is deliberate.

### no-global-mutable-singletons — present
- **Expectation:** no top-level `let` exports holding mutable state.
- **Status: present.** Grep for `export let` in `src/` returns zero matches. The only module-level exports are `const` (`WARNING_THRESHOLD`, `CRITICAL_THRESHOLD`) and pure functions/types.
- **Evidence:** `src/features/threshold-counter/useThresholdCounter.ts:10-11`.

### side-effects-isolated — present
- **Expectation:** components do not touch `localStorage`/`sessionStorage`/`document.cookie`/`window.*` directly.
- **Status: present.** Grep across `src/` returns zero matches for any of those. The one legitimate DOM access (`document.getElementById('root')`) lives in `main.tsx`, the composition root — the correct place, and it fails loudly if `#root` is missing (matches CONVENTIONS.md "Fail loudly at boundaries").
- **Evidence:** `src/main.tsx:6-9`.

### server-client-distinction — missing
- **Status: missing / N/A.** Not Next.js App Router (Vite-React). `'use client'` does not apply. Skipped per SKILL.md.

---

## Layer 4 — Convention adherence

### file-naming-consistency — present
- **Expectation:** dominant naming pattern per directory; flag outliers.
- **Status: present.** Every file matches the rules in `.agents/project/CONVENTIONS.md`: folder `threshold-counter` (kebab-case); component file `ThresholdCounter.tsx` (PascalCase); hook `useThresholdCounter.ts` (`useCamelCase`, same-name file); test `ThresholdCounter.test.tsx` (co-located `<Name>.test.tsx`); constants `WARNING_THRESHOLD`/`CRITICAL_THRESHOLD` (SCREAMING_SNAKE_CASE); types `ThresholdStatus`/`ThresholdLevel` (PascalCase). No outliers.
- **Evidence:** all four files under `src/features/threshold-counter/`; rules in `.agents/project/CONVENTIONS.md:7-16`.

### directory-structure-consistency — present
- **Expectation:** directories of the same kind follow the same convention as siblings.
- **Status: present.** The single feature folder matches the canonical four-file shape prescribed in `.agents/project/ARCHITECTURE.md`. (With one feature there are no siblings to diverge — consistency is satisfied trivially and the template it instantiates is correct.)
- **Evidence:** `.agents/project/ARCHITECTURE.md:12-24`; `src/features/threshold-counter/`.

### index-barrels-consistent — present
- **Expectation:** if barrels are used in any feature folder, they are used in every feature folder.
- **Status: present.** The one feature folder has a barrel (`index.ts`); there is no second feature to be inconsistent with. The convention is codified in ARCHITECTURE.md rule 3 and CONVENTIONS.md ("import a feature only via its `index.ts`").
- **Evidence:** `src/features/threshold-counter/index.ts:1`.

### public-api-documented — partial
- **Expectation (soft check):** each feature's `index.ts` carries a documenting comment describing its public surface, or the folder has a `README.md`. Missing docs -> `partial`, never `violation`.
- **Status: partial.** `src/features/threshold-counter/index.ts` is a bare one-line re-export with no doc comment, and the folder has no `README.md`. The component itself has a good JSDoc block (`ThresholdCounter.tsx:3-7`) and the hook's purpose is documented (`useThresholdCounter.ts:13-18`), but the **public surface itself** (the barrel) is undocumented.
- **Evidence:** `src/features/threshold-counter/index.ts:1` (no comment); no `README.md` in the folder.
- **Remediation:** add a 1–3 line doc comment to `index.ts` naming what the feature exposes and what stays private. Cheap, and it sets the template every future feature copies.

---

## Bottom line

Zero violations, one soft `partial` (undocumented barrel). The codebase is small enough that most strong claims rest on *design intent plus one instance* rather than measured behaviour at scale, and six checks are `missing` purely because graphify was not run or the structure to test them does not exist yet. The architecture is correct **as far as it can be evaluated** — the open question this audit cannot answer is whether the discipline holds when the second, fifth, and twentieth feature land.

Full machine-readable results: `.architect-audits/architecture-audit/findings.json`. Snapshot: `.architect-audits/architecture-audit/snapshot.md`. Run metadata: `.architect-audits/architecture-audit/metadata.json`.
