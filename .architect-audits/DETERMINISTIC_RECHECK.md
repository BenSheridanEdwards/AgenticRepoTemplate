# Deterministic recheck at current HEAD

The committed reports under `.architect-audits/` are historical snapshots bound
to older commits and the repository's former name (see [`README.md`](./README.md)).
This file records the signals that can be re-run **without interactive LLM
judgement**, executed against the current tree so that nothing here restates a
stale grade as if it were fresh.

## What this recheck pertains to

- **Repository:** `BenSheridanEdwards/AgenticRepoTemplate` (current name).
- **Commit:** `9d91a70b269d5eaba95b6abeb1b6d5a30a109226`.
- **Date:** 2026-07-07.
- **Runner:** Node `v22.22.3`, pnpm `11.3.0`, fallow `2.97.0`, gitleaks `8.30.1`.

These are the deterministic, headless checks only. The full ArchitectPlaybook
LLM-graded audits (`agentic`, `architecture`, `quality-gates`, `security`,
`testing`) were **not** re-run in this change; that interactive pass is still
tracked in [`../TODO.md`](../TODO.md).

## Signals re-run, with real current results

Every row below is the actual result of running the command against the commit
above. Nothing is carried forward from the historical reports.

| Signal | Command | Exit | Result at this commit |
| --- | --- | --- | --- |
| Type check | `pnpm typecheck` | 0 | No type errors. |
| Format / lint | `pnpm check` (Biome) | 0 | No lint or format findings. |
| Introduced-issue audit | `pnpm fallow:audit` | 0 | 0 changed files vs `main`, 0 issues. |
| Structural health (full tree) | `fallow health` | 0 | 22 files, 59 functions, 0 above threshold, maintainability 96.0. |
| Unit tests + coverage | `pnpm test:coverage` | 0 | 4 suites, 19 tests, 100% statements / branches / functions / lines over the collected feature surface. |
| Production build | `pnpm build` | 0 | Built to `dist/` in ~340ms. |
| Bundle size budget | `pnpm size` | 0 | JS 52.83 kB brotli (limit 80 kB), CSS 697 B brotli (limit 5 kB). |
| License compliance | `pnpm license:check` | 0 | Every dependency under the permissive allow-list (14 distinct licenses). |
| Staged secret scan | `pnpm secret-scan` (gitleaks) | 0 | No leaks found. |
| Dependency audit | `pnpm audit --audit-level=high` | 0 | 2 moderate advisories, 0 high or critical (below the gate threshold). |

### Structural facts from `fallow health --format json`

Measured from the full tree, not asserted:

- Circular dependencies: 0.
- Dead files: 0. Dead exports: 0. Duplication: 0%.
- Average cyclomatic complexity: 1.6 (p90 3). Critical-complexity functions: 0.
- Maximum render fan-in: 1 (no god component by the render-coupling measure).
- Total lines analysed: 1561 across 22 files.

## Signals NOT re-run here

- **The five LLM-graded ArchitectPlaybook audits.** These require the interactive
  Claude Code skills (`/agentic-audit`, `/architecture-audit`,
  `/quality-gates-audit`, `/security-audit`, `/testing-audit`) and cannot be
  reproduced headlessly in this change, so their grades are left as the historical
  snapshots they are and their re-run stays tracked in `../TODO.md`. No grade in
  those reports was edited to look current.
- **Graphify / graph-derived checks** (community cohesion, orphan detection as the
  audits computed them). The historical reports built a Graphify index; that graph
  build is not reproduced here, so those specific graph-derived numbers are not
  re-stated as current. The `fallow health` structural facts above are the
  deterministic substitute for cycle and dead-code detection at this commit.
- **E2E, accessibility, Lighthouse, and StyleProof visual gates.** These run a
  browser and are not part of this evidence-only recheck. They remain wired in CI.

## How to reproduce

From a clean checkout at the commit above:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm check
pnpm fallow:audit
npx fallow health
pnpm test:coverage
pnpm build
pnpm size
pnpm license:check
pnpm secret-scan
pnpm audit --audit-level=high
```
