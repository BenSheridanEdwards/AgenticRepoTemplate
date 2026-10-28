---
name: adopt-the-factory
description: >-
  Adopt or audit this template's agent guidance, local quality gates, CI, and
  PR proof contract in a repository. Use when installing the factory or
  bringing its existing layers into agreement.
---

# Adopt the factory

Make the target repository's standards executable and its guidance accurate.
Adapt the template to the target's stack and existing tools.

## Read the target first

- Read `git status --short --branch`, the command manifest, lockfile, and
  toolchain configuration.
- Inspect existing agent instructions, hooks, scripts, CI workflows, tests,
  deployment configuration, and the PR template.
- In this template, read `.agents/project/AGENTIC_INFRASTRUCTURE.md`,
  `QUALITY_GATES.md`, `TECH_STACK.md`, `DEFINITION_OF_DONE.md`, and
  `PR_QUALITY.md` under `.agents/project/`.
- Name the package manager, framework, CI provider, default branch, and
  commands that will prove the installation works.

## Give each layer one owner

This template currently uses these paths; check the target before copying.

| Layer | Current home |
| --- | --- |
| Claude import | `.claude/CLAUDE.md` imports `AGENTS.md` with `@../AGENTS.md`. |
| Operating contract | `AGENTS.md` holds commands, rules, and the context map. |
| Tool adapter | `.agents/CLAUDE_CODE.md`, `.claude/settings.json`, and hooks hold Claude-specific setup. |
| Project standards | `.agents/project/` holds architecture, conventions, tool ownership, and completion rules. |
| Decisions and patterns | `.agents/decisions/` holds ADRs; `.agents/templates/` holds starting points. |
| Repeated workflows | `.claude/skills/` holds skills. |
| Executable checks | `.husky/`, `scripts/`, and `.github/workflows/` run local and remote gates. |
| Review proof | `.github/pull_request_template.md` and `.agents/project/PR_QUALITY.md` define the handoff. |

Keep each rule in its owning layer and link to it from other guidance.
Tie each claim to a command, hook, workflow, or named review check. Describe
an unenforced target as a gap, and resolve disagreements between docs and code.

## Install gates by feedback speed

Reuse the target's tools and keep one owner for each concern. This template's
ownership matrix lives in `.agents/project/QUALITY_GATES.md`: Biome owns
formatting and general lint, ESLint owns policy and React rules, Oxlint owns
vendored anti-slop rules, and React Doctor owns its remaining project checks.
TypeScript, Jest, Playwright, Fallow, API Extractor, and security scanners own
their respective checks. Use an ADR to justify a new tool for an owned concern.

- Commit message: enforce Conventional Commits.
- Pre-commit: typecheck, staged Biome, anti-slop, Fallow audit including
  complexity, and staged gitleaks. Measure each step against the documented
  30-second budget and review slower steps for placement at pre-push.
- Pre-push: check that the branch contains current main, then run the full
  local suite, production build, and E2E map. This also checks clean merges,
  for which Git skips pre-commit.
- CI: rerun local proof from a clean checkout and add the checks that need
  hosted permissions, credentials, or browser infrastructure. Keep required
  job names aligned with branch protection.

When hook tests create or inspect other Git repositories, clear Git-local
hook variables before running them: `unset $(git rev-parse --local-env-vars)`.
Keep existing thresholds and gates at full strength while fixing failures.
Document external tooling as external until it is installed and runs.

## Prove the adoption

Run changed scripts or hooks directly where practical, then the target's
aggregate verification command and E2E tests. In this template use
`pnpm check:context`, `pnpm check:docs`, `pnpm verify`, and `pnpm e2e`.
Validate changed skill frontmatter. Before a push, clear findings from
`pnpm lint:anti-slop` and `pnpm lint:anti-slop:changed` on the committed head.

Use `pr-quality-contract` to prepare exact commands and results, committed
inline visual proof when UI changes, current-head CI status, risk, rollback,
and explicit gaps. Keep private facts and machine-local paths out of public
guidance and proof. Claim installation only for checks that actually ran;
name pending CI or runtime verification before reporting completion.
