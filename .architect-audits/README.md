# Architecture audits — committed reports are a snapshot, and it is stale

These are committed [ArchitectPlaybook](https://github.com/BenSheridanEdwards/ArchitectPlaybook)
reports: `agentic-audit`, `architecture-audit`, `quality-gates-audit`,
`security-audit`, and `testing-audit`. They are proof of the audit loop, not a
live status.

## What these reports graded

- **Date:** all five runs are stamped `2026-06-17`.
- **Commits:** the reports graded earlier commits, not current `HEAD`:
  - `architecture-audit` and `testing-audit`: commit
    `02d36ecca8746812e4265a3f6534a2c2cdbeefb2`.
  - `agentic-audit`, `quality-gates-audit`, and `security-audit`: commit
    `f4c862b97f79738bbe04483f2d1f2f494f77037e`.
- **Former repository name:** every report names the repository
  `AgenticProjectTemplate`. **The repository has since been renamed to
  `AgenticRepoTemplate`.** The old name in the `repository` fields and prose is
  a fact about when the report was generated, not a current identifier.

## Do not read these as current fact

The repo has changed since these runs (this note itself is one such change), so
any grade here describes the tree at the commit above, not `HEAD`. The committed
reports have **not** been re-generated or edited to fabricate fresh results.
Doing so without actually re-running the audits would be dishonest. In
particular, none of the LLM-graded verdicts, check tallies, or
present/partial/missing counts were copied forward or invented for the current
tree.

Where a snapshot names a gap that the current tree has since closed, treat the
snapshot as the older fact and the deterministic recheck below as the current
one. For example, the `quality-gates-audit` snapshot lists "no
license-compliance check" as a true absence; the current tree ships
`pnpm license:check` and it passes (recorded in the recheck).

## Deterministic recheck at current HEAD

The signals that can be re-run **without interactive LLM judgement** were
executed against the current tree and their real results recorded in
[`DETERMINISTIC_RECHECK.md`](./DETERMINISTIC_RECHECK.md):

- **Pertains to:** `BenSheridanEdwards/AgenticRepoTemplate`, commit
  `9d91a70b269d5eaba95b6abeb1b6d5a30a109226`, dated 2026-07-07.
- **Re-run and green:** `pnpm typecheck`, `pnpm check`, `pnpm fallow:audit`,
  `fallow health` (22 files, 0 above threshold, 0 cycles, 0 dead code,
  maintainability 96.0), `pnpm test:coverage` (19 tests, 100% over the feature
  surface), `pnpm build`, `pnpm size`, `pnpm license:check`, `pnpm secret-scan`,
  and `pnpm audit --audit-level=high` (0 high, 2 moderate).
- **Still pending an owner-run pass:** the five LLM-graded ArchitectPlaybook
  audits, plus the Graphify graph-derived checks. These are interactive and are
  not re-graded here.

## Re-run the interactive audits

Re-running the LLM-graded audits against current `HEAD` (with an updated repo
name and commit) is tracked as an explicit item in [`../TODO.md`](../TODO.md).
Regenerate them with the documented commands in [`../README.md`](../README.md)
(`pnpm setup:agents`, then `/pre-audit-setup` and the individual `/…-audit`
commands) rather than hand-editing these files.
