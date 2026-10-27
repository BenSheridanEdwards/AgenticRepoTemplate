---
name: install-agentic-infrastructure
description: >-
  Install or upgrade agentic engineering infrastructure in a repository. Use
  when asked to add or standardize AGENTS.md, CLAUDE.md, .agents project
  context, Claude skills/hooks/settings, Husky pre-commit or pre-push gates,
  GitHub Actions CI, Fallow, Graphify/ArchitectPlaybook setup, or proof-backed
  pull request quality gates.
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

- **Root pointers:** `CLAUDE.md` points to `.agents/START_HERE.md` and imports
  it with `@.agents/START_HERE.md`. `AGENTS.md` points to `.agents/START_HERE.md`.
- **Portable contract:** `.agents/START_HERE.md` tells any agent how to work here.
- **Tool adapter:** `.agents/CLAUDE_CODE.md`, `.claude/settings.json`, hooks,
  and skills add Claude-specific affordances.
- **Project memory:** `.agents/project/` holds architecture, conventions,
  Definition of Done, tech stack, glossary, and PR quality expectations.
- **Decisions:** `.agents/decisions/` records durable tradeoffs as ADRs.
- **Templates:** `.agents/templates/` gives agents copyable starting points.
- **Local gates:** package scripts plus Husky `pre-commit`, `commit-msg`, and
  `pre-push` catch issues before review.
- **CI gates:** GitHub Actions rerun the same proof on a clean checkout and add
  server-only checks: SAST, dependency audit, license, secret scan, visual,
  accessibility, performance, and artifact upload.
- **PR contract:** the PR template requires exact proof, screenshots when
  UI changed, and explicit unverified gaps.

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
   - `pre-commit`: typecheck, staged Biome lint and format, Fallow audit
     including complexity, and staged gitleaks; each step under 30 seconds on a
     realistic staged change. Record timings and review slower steps for a
     likely move to pre-push.
   - `pre-push`: the up-to-date-with-main check, then the full local gate suite
     (static checks, coverage, production build) and the E2E behaviour map.
     Git skips pre-commit for a merge with no conflicts, so this is where a
     clean merge gets checked.
     If those checks create or inspect other Git repos, clear Git-local hook
     variables before running them: `unset $(git rev-parse --local-env-vars)`.
5. **Install CI as the clean-room mirror.** Split jobs by concern and keep names
   stable enough for branch protection: type/lint/format, Fallow/code
   intelligence, tests, build, E2E, security, CodeQL, Lighthouse.
6. **Install agentic tools deliberately.** Wire Fallow as a repo dependency or
   action. Document Ponytail and ArchitectPlaybook setup as
   external tooling unless the target repo already vendors or pins those tools.
7. **Set lint ownership.** Biome owns formatting, import ordering, and general
   lint. ESLint owns policy, React hooks, React Compiler, and React Doctor
   rules, and the React Doctor CLI owns its project-level checks. Each rule has
   one owner. Use TypeScript, React Testing Library, `jest-axe`, Playwright axe,
   Lighthouse, CodeQL, and Fallow for the behaviour they observe.
8. **Add PR proof.** Add `.github/pull_request_template.md` and
   `.agents/project/PR_QUALITY.md`; require local proof, CI status, visual proof
   or `N/A`, and residual risk.
9. **Record tradeoffs.** If a gate is too slow for local use, CI-only, advisory,
   or temporarily absent, write an ADR or explicit gap. Claim only the protection
   a gate enforces.
10. **Verify in layers.** Run the changed hook directly when possible, then the
    repo's local aggregate command, E2E, and finally GitHub Actions on the PR.

## Adaptation Rules

- Keep private project names, paths, secrets, and customer details out of public
  template repos.
- Keep one owner per concern. A new formatter, lint engine, test runner, or
  scanner needs an ADR that names the uncovered requirement it owns.
- Keep TypeScript, Biome, coverage, Lighthouse, and branch protection
  thresholds at full strength while making an installation green.
- Prefer advisory local gates plus hard CI gates when a tool needs credentials,
  GitHub permissions, paid runners, or a browser environment.
- For brownfield repos, fail only on introduced issues where possible. A gate
  that drowns the team in old findings will get bypassed.
- Report "installed everywhere" once the command, hook, or workflow runs.
  Filesystem presence is a claim; a run is proof.

## Done When

- The repo has a clear guidance layer, local hooks, CI workflows, PR template,
  and Definition of Done that agree with one another.
- Every quality concern has one named owner and one proof command or workflow.
- Local commands pass, or failures are reported with exact output and next
  action.
- The PR is ready, not draft, and latest-sha CI is green before claiming the
  installation complete.
