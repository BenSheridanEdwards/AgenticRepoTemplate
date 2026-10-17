# 31. Convert the repo into a pnpm workspace with the app at apps/web

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-17
- **Implements:** [0009](0009-move-the-app-to-apps-web-first.md)

## Context

[0009](0009-move-the-app-to-apps-web-first.md) moves the app into a pnpm
workspace at `apps/web` before any other monorepo work, so later PRs write their
paths once. Every gate here names single-app paths: `src/**` in ESLint, Biome,
Jest and the Fallow zones, `e2e/` in Playwright, `etc/` in the API reports,
`dist/` in size-limit, Lighthouse and the CI artifact. Several of them would
cover nothing after a plain move and still pass. The ESLint `files` glob, the
Biome naming override, the Jest coverage globs and `scripts/lighthouse-scope.mjs`
match no file. `scripts/check-dependency-adr.mjs` reads only the root
`package.json`, so a dependency added to `apps/web/package.json` needs no ADR.

## Decision

`pnpm-workspace.yaml` lists `packages: ['apps/*']`. The app is the `@repo/web`
package in `apps/web/`: `src/`, `e2e/`, `etc/`, `index.html`, `vite.config.ts`
and a `package.json` with the `dev`, `build` and `preview` scripts, `react` and
`react-dom`, and `vite` and `@vitejs/plugin-react`. The build writes
`apps/web/dist/`.

Each gate keeps one config at the root and reaches the package by glob. No
package carries a config of its own, so no package can loosen a rule locally.

- The root `package.json` keeps every script name and the tooling. `dev`,
  `build` and `preview` delegate with `pnpm --filter @repo/web`, so the CI
  `run:` lines, the hooks and `.claude/settings.json` stay as they are.
- ESLint runs on `apps/*/src/**/*.{ts,tsx}` and ignores `**/dist/**`.
  `policy/pages-in-routes` accepts a page under the package's own
  `src/routes/`. The Biome naming override covers `apps/*/src/**`.
- Jest roots are `apps`, `scripts` and `tooling`. Coverage comes from
  `apps/*/src/**` with the same exclusions and the same 80 percent threshold.
- The Fallow zones name `apps/web/src/...`. The `features` zone gains the
  `patterns` fallback that `routes` already has. A file directly under
  `features/` sat in no zone and could import anything. It now sits in the
  fallback zone, which may import `shared` and the feature folders, and no
  feature may import it. A loose file can still compose several features
  outside `routes/`. This is a known gap, no wider than main, and a test
  records it as one. The ESLint `policy/slice-isolation` rule in the next PR
  closes it and must cover files directly under `features/`. The config
  also stays valid on a tree without `apps/web/src/features`, which is what
  `fallow audit` reads when it builds its base-revision snapshot with the head
  config. Without it the audit of this change exits 2.
- `scripts/api-report.mjs` writes each report to `<package>/etc/`, the nearest
  folder with a `package.json` above the entry, so the reports live in
  `apps/web/etc/` with the same bytes.
- `pnpm check:adr` reads the root manifest plus every manifest the workspace
  file lists, at the base and at head. A dependency is new only when no manifest
  at the base names it, so moving `react` into `apps/web` needs no ADR, and a
  `workspace:` reference to a sibling package is not a dependency.
- `pnpm license:check` lists licenses with `pnpm --recursive`, so every
  workspace package is in scope.
- `scripts/lighthouse-scope.mjs` treats `apps/web/src/`, `apps/web/public/`,
  `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/package.json` and
  `pnpm-workspace.yaml` as UI-relevant, beside the root files it already named.
  Lighthouse audits `apps/web/dist`, and size-limit budgets
  `apps/web/dist/assets`.
- `react-doctor . --yes` finds the `@repo/web` workspace project on its own, so
  the command stays the same. It scans the package's files. The root scripts
  and configs it also counted before hold no React code, and the React Doctor
  rules run through ESLint in `pnpm lint:policy`.

The two demo features stay in this change and leave in the next one
([0008](0008-convert-template-into-the-monorepo.md)). The unchanged
six-test behaviour map and the cross-feature Fallow seed both need them, and an
unchanged move is what proves the move.

New tests prove each path-sensitive gate still fails on a seeded violation
under the new layout: `scripts/biome-overrides.test.ts`,
`scripts/jest-scope.test.ts` and `tooling/architecture/boundaries.test.ts`,
plus new cases in the ESLint policy, Lighthouse scope and dependency ADR tests.

## Consequences

- Later packages (`apps/api`, `packages/ui`, `showcase/*`) join by adding a
  workspace glob and widening the root globs. ESLint, Biome, Jest, coverage,
  `check:adr` and the license check already match `apps/*`. The tsconfig
  `include`, the Fallow zones, the API report entries, the Lighthouse scope
  and size-limit name `apps/web`, so the change that adds a package widens
  them in the same commit.
- The built bundle is byte-identical to the one built before the move.
- `pnpm check:adr` now covers every workspace manifest.
- A new package that needs a gate tool config of its own needs an ADR.
