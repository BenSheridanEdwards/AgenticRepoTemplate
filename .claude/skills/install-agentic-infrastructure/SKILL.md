---
name: install-agentic-infrastructure
description: >-
  Install or upgrade agentic engineering infrastructure in a repository. Use
  when asked to add or standardize AGENTS.md, CLAUDE.md, .agents project
  context, Claude skills/hooks/settings, Husky pre-commit or pre-push gates,
  GitHub Actions CI, StyleProof, Fallow, Graphify/ArchitectPlaybook setup, or
  proof-backed pull request quality gates.
---

# Install Agentic Infrastructure

Use this skill to make a repo self-explanatory to agents and mechanically hard
to degrade. Install only what the target repo can actually run and prove.

## Read First

- `git status --short --branch`
- `package.json`, lockfile, toolchain files, and existing scripts
- `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.husky/`
- `.github/workflows/`, `.github/pull_request_template.md`, `dependabot.yml`
- Existing test, build, lint, accessibility, visual, security, and deploy docs

## Target Architecture

Layer the infrastructure so every instruction has one owner.

- **Portable contract:** `AGENTS.md` tells any agent how to work here.
- **Tool adapter:** `CLAUDE.md`, `.claude/settings.json`, hooks, and skills add
  Claude-specific affordances.
- **Project memory:** `.agents/project/` holds architecture, conventions,
  Definition of Done, tech stack, glossary, and PR quality expectations.
- **Decisions:** `.agents/decisions/` records durable tradeoffs as ADRs.
- **Templates:** `.agents/templates/` gives agents copyable starting points.
- **Local gates:** package scripts plus Husky `pre-commit`, `commit-msg`, and
  `pre-push` catch issues before review.
- **CI gates:** GitHub Actions rerun the same proof on a clean checkout and add
  server-only checks: SAST, dependency audit, license, secret scan, visual,
  accessibility, performance, and artifact upload.
- **PR contract:** the PR template requires exact proof, screenshots or
  StyleProof evidence when UI changed, and explicit unverified gaps.

## Process

1. **State assumptions and success criteria.** Name the target package manager,
   app framework, CI provider, default branch, and what "installed" will mean.
2. **Inventory before copying.** Read the real scripts, workflows, hooks, and
   docs. If the target already has a tool, adapt it instead of adding a second
   owner for the same concern.
3. **Install guidance first.** Add or update `AGENTS.md`, `CLAUDE.md`, and
   `.agents/` so agents know the repo shape before code changes begin.
4. **Install local gates by feedback speed.**
   - `commit-msg`: Conventional Commits.
   - `pre-commit`: fast staged checks: typecheck, Biome, code intelligence,
     staged secret scan.
   - `pre-push`: slower proof: coverage, production build, E2E behaviour map.
     If those checks create or inspect other Git repos, clear Git-local hook
     variables before running them: `unset $(git rev-parse --local-env-vars)`.
5. **Install CI as the clean-room mirror.** Split jobs by concern and keep names
   stable enough for branch protection: type/lint/format, Fallow/code
   intelligence, tests, build, E2E, security, CodeQL, Lighthouse, StyleProof.
6. **Install agentic tools deliberately.** Wire Fallow as a repo dependency or
   action. Document Graphify, GitNexus, Ponytail, and ArchitectPlaybook setup as
   external tooling unless the target repo already vendors or pins those tools.
   Generated analysis indexes (`graphify-out/`, `.gitnexus/`) must be ignored
   by VCS and formatter/linter tools.
7. **Set the Biome boundary.** Biome owns formatting, import ordering, and the
   rules it actually implements. Use TypeScript, React Testing Library,
   `jest-axe`, Playwright axe, Lighthouse, CodeQL, Fallow, and StyleProof for
   the concerns ESLint plugins often covered.
8. **Add PR proof.** Add `.github/pull_request_template.md` and
   `.agents/project/PR_QUALITY.md`; require local proof, CI status, visual proof
   or `N/A`, and residual risk.
9. **Record tradeoffs.** If a gate is too slow for local use, CI-only, advisory,
   or temporarily absent, write an ADR or explicit gap. Do not imply protection
   that is not enforced.
10. **Verify in layers.** Run the changed hook directly when possible, then the
    repo's local aggregate command, E2E, and finally GitHub Actions on the PR.

## Adaptation Rules

- Keep private project names, paths, secrets, and customer details out of public
  template repos.
- Do not add ESLint, Prettier, a second test runner, or duplicate scanners
  unless an ADR explains a concrete uncovered requirement.
- Do not weaken TypeScript, Biome, coverage, Lighthouse, StyleProof, or branch
  protection thresholds to make an installation green.
- Prefer advisory local gates plus hard CI gates when a tool needs credentials,
  GitHub permissions, paid runners, or a browser environment.
- For brownfield repos, fail only on introduced issues where possible. A gate
  that drowns the team in old findings will get bypassed.
- Never report "installed everywhere" from filesystem presence alone. Prove the
  command, hook, or workflow runs.

## Done When

- The repo has a clear guidance layer, local hooks, CI workflows, PR template,
  and Definition of Done that agree with one another.
- Every quality concern has one named owner and one proof command or workflow.
- Local commands pass, or failures are reported with exact output and next
  action.
- The PR is ready, not draft, and latest-sha CI is green before claiming the
  installation complete.
