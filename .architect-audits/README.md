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
reports have **not** been re-generated or edited to fabricate fresh results —
doing so without actually re-running the audits would be dishonest.

Re-running the audits against current `HEAD` (with an updated repo name and
commit) is tracked as an explicit item in [`../TODO.md`](../TODO.md). Regenerate
them with the documented commands in [`../README.md`](../README.md)
(`pnpm setup:agents`, then `/pre-audit-setup` and the individual `/…-audit`
commands) rather than hand-editing these files.
