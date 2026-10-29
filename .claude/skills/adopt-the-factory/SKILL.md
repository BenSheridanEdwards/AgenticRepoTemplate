---
name: adopt-the-factory
description: >-
  Adopt or audit this template's agent guidance, local quality gates, CI, and
  PR proof contract in a repository. Use when installing the factory or
  bringing its existing layers into agreement.
---

# Adopt the factory

Make the target's standards executable and its guidance accurate. Adapt this template to its stack and tools.

## Read the target first

- Read `git status --short --branch`, the command manifest, lockfile, and toolchain config.
- Inspect agent instructions, hooks, scripts, CI workflows, tests, deployment config, and the PR template.
- In this template, read `.agents/HARNESSES.md`, plus `QUALITY_GATES.md`,
  `TECH_STACK.md`, and `PR_QUALITY.md` under `.agents/project/`.
- Name the package manager, framework, CI provider, default branch, and proof commands.

## Give each layer one owner

Check the target before copying this template's layout.

| Layer | Current home |
| --- | --- |
| Claude import | `.claude/CLAUDE.md` imports `AGENTS.md` with `@../AGENTS.md`. |
| Operating contract | `AGENTS.md` holds commands, rules, and the context map. |
| Harness setup | `.agents/HARNESSES.md` maps entry points; `.claude/settings.json` and hooks configure Claude Code. |
| Project standards | `.agents/project/` holds architecture, conventions, tool ownership, and completion rules. |
| Decisions and patterns | `.agents/decisions/` holds ADRs; `.agents/templates/` holds starting points. |
| Repeated workflows | `.agents/skills/` holds skills. |
| Executable checks | `.husky/`, `scripts/`, and `.github/workflows/` run local and remote gates. |
| Review proof | `.github/pull_request_template.md` and `.agents/project/PR_QUALITY.md` define the handoff. |

Keep rules in their owning layer and link elsewhere. Tie claims to a command, hook, workflow, or named
review check. Name unenforced targets as gaps and resolve disagreements between docs and code.

## Install gates by feedback speed

Reuse the target's tools with one owner per concern, following
[`.agents/project/QUALITY_GATES.md`](../../../.agents/project/QUALITY_GATES.md). Justify new tools for owned concerns in an ADR.

- Commit message: enforce Conventional Commits.
- Pre-commit: typecheck, staged Biome, anti-slop, Fallow audit including
  complexity, and staged gitleaks. Measure each step against the 30-second
  budget; review slower steps for pre-push.
- Pre-push: check the branch contains current main, then run the full local
  suite, production build, and E2E map. This catches clean merges, where Git skips pre-commit.
- CI: rerun local proof from a clean checkout. Add checks that need hosted
  permissions, credentials, or browsers; align required job names with branch protection.

When hook tests create or inspect other Git repositories, clear Git-local hook variables first: `unset $(git rev-parse --local-env-vars)`.
Fix failures with existing thresholds and gates at full strength. Describe external tooling as external until it is installed and runs.

## Prove the adoption

Run changed scripts or hooks directly where practical, then the target's
aggregate verification and E2E commands. Here, use `pnpm check:context`,
`pnpm check:docs`, `pnpm verify`, and `pnpm e2e`. Validate skill frontmatter.
Before a push, clear `pnpm lint:anti-slop` and `pnpm lint:anti-slop:changed`
findings on the committed head.

Use `pr-quality-contract` and [`.agents/project/PR_QUALITY.md`](../../../.agents/project/PR_QUALITY.md)
for exact commands, results, committed inline UI proof, risk, rollback, and gaps.
Check current-head CI before reporting completion; keep its status out of the body.
Keep private facts and machine-local paths out of public guidance and proof.
Claim installation only for checks that ran; report outstanding CI or runtime verification.
