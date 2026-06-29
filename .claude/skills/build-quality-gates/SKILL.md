---
name: build-quality-gates
description: >-
  Create, audit, or update quality gates for an agentic repo. Use when working
  on Husky pre-commit or pre-push hooks, commit-msg checks, GitHub Actions CI,
  lint/type/test/build/security/accessibility/visual gates, or the tooling
  matrix that decides which tool owns each quality concern.
---

# Build Quality Gates

Use this skill to make quality standards executable at the earliest useful
point: commit, push, CI, or PR review.

## Read First

- `package.json`
- `.agents/project/QUALITY_GATES.md` when present
- `.agents/project/TECH_STACK.md`
- `.agents/project/DEFINITION_OF_DONE.md`
- `.husky/`
- `.github/workflows/`
- `scripts/`

## Process

1. **Inventory the real gates.** Read hooks, workflows, scripts, and package
   commands. Do not copy a checklist from another repo until the commands exist
   here.
2. **Assign one owner per concern.** Keep the stack unambiguous: one formatter,
   one lint owner, one type checker, one unit runner, one E2E runner, one visual
   gate, one security scanner per class.
3. **Place gates by feedback speed.**
   - Pre-commit: fast correctness, staged formatting, dead code/cycles, secrets.
   - Commit-msg: Conventional Commits.
   - Pre-push: slower behaviour proof, build smoke, E2E.
   - CI: clean-checkout rerun plus dependency, license, SAST, performance,
     accessibility, and visual gates.
4. **Keep local and CI proof aligned.** If CI runs a required check, expose a
   local command that gives a close signal before push.
5. **Make gaps explicit.** If a concern is review-only or intentionally deferred,
   document that instead of implying it is enforced.
6. **Verify the gate change.** Run the changed hook/script directly when
   possible, then `pnpm check`, `pnpm verify`, and `pnpm e2e` for this template.

## Biome Boundary

Biome owns formatting, import ordering, and lint rules it actually implements.
Do not add ESLint just to recreate plugin muscle memory. Cover the usual ESLint
plugin concerns with the gate that owns the behaviour:

- Type semantics: `tsc --noEmit`
- React behaviour: Jest + React Testing Library
- Accessibility: `jest-axe`, `@axe-core/playwright`, and Lighthouse
- Security patterns: CodeQL, gitleaks, `pnpm audit`
- Architecture drift: Fallow
- Visual regressions: StyleProof

Only add ESLint through an ADR if a concrete required rule is not covered by
Biome, TypeScript, tests, security gates, or review.

## Done When

- The hook/workflow/script exists and is referenced by the docs that claim it.
- Local commands and CI jobs agree on the Definition of Done.
- The gate fails closed for the risk it owns.
- Verification output names exactly which gates ran.
