# North Star

## The factory is the repository

A software factory is a repository any agent can operate in, on any model or harness, with executable
standards that refuse code outside the project's conventions. Lint carries most of that load and stays red
until the agent fixes it. Slop is needless complexity or broken conventions; close the routes around each
refusal. Domain docs inform the agent; gates decide what lands.

Success means any person's agent can clone the template and produce PRs a named human can approve or
redirect in minutes. Every written rule names its check. Every PR names its outcome, proves it with
committed evidence, and states what would falsify it. Every gate change carries a human signature.

Use [AGENTS.md](../AGENTS.md) for operating rules, [TECH_STACK.md](../.agents/project/TECH_STACK.md) for
installed tools, [QUALITY_GATES.md](../.agents/project/QUALITY_GATES.md) for checks, and
[ADRs](../.agents/decisions/) for settled decisions.

## Principles

### 1. Lint beats instructions

When an agent gets something wrong twice, write a rule that blocks the change and explains the fix. Prose
and skills guide work; lint and CI enforce quality. Keep project skills when they earn their place; most
skills ship with the agent.

The toolchain combines Biome, ESLint, strict TypeScript over four programs, Fallow boundaries and
`contract/<id>` rules, structure checks, and unit and E2E tests. [Quality
gates](../.agents/project/QUALITY_GATES.md) defines the hook sequence: pre-commit checks types, staged
formatting/lint, changed-file Fallow complexity and secrets; pre-push requires freshly fetched
`origin/main`, `pnpm verify` and `pnpm e2e`. CI repeats every gate on a clean checkout. Each pre-commit step
must take under 30 seconds on a realistic change; record measurements and review slower steps for a move to
pre-push. Timing is held by review. Running every convention check before every commit remains a target
within that budget. Git skips pre-commit on conflict-free merges; Fallow's audit skips when its base branch
is absent ([ADR 0028](../.agents/decisions/0028-pre-push-runs-the-full-local-gate-suite.md)).

The [bypass hook](../.agents/hooks/block-gate-bypass.sh) refuses common skips, including `--no-verify`,
`git commit -n`, `HUSKY=0`, and hooksPath, alias or config include rewrites, in Claude Code, trusted Codex
hook sessions and Cursor agents. Its known gaps are in [ADR 0027](../.agents/decisions/0027-block-common-hook-bypasses.md);
clean-checkout CI and hosted required checks remain the backstop.

Warnings fail Biome, ESLint and React Doctor. [ADR 0079](../.agents/decisions/0079-no-advisory-lint.md) records
Ben's lint decision: every rule becomes an error or is removed, including Fallow's warning tier. That rollout is
not finished yet. Jest and Playwright console warnings still pass; warnings-as-failures across
every tool remains a target.

ESLint rejects inline config; keep reasoned exceptions in `eslint.config.js`. Other engines accept reasoned
`biome-ignore`, `@ts-expect-error` and `fallow-ignore` outside result roots. Structure checks reject these,
ESLint directives and coverage pragmas in `apps/` and `showcase/<id>/`; review holds coverage pragmas
elsewhere. [Conventions](../.agents/project/CONVENTIONS.md) names the enforcers.

Label standards without gates as targets. Close aliases, re-exports, inline disables and config edits around
a rule before calling it finished. Changes that loosen or rewrite enforcement need Ben's sign-off on the
exact commit ([ADR 0024](../.agents/decisions/0024-sign-off-only-loosening-enforcement-changes.md)). Biome
owns format and general lint; ESLint owns policy, hooks and Compiler rules. React Doctor rules block through
ESLint where available and through CI otherwise.

### 2. Layers import downward, slices stand alone, decisions live in ADRs

[Architecture](../.agents/project/ARCHITECTURE.md) owns the role/folder/import/Fallow zone table. Value
imports flow downward; Fallow rejects unlisted edges and `coverage.requireAllFiles` rejects unassigned
source. Type-only imports may cross roles, subject to slice isolation and route co-location. Tests, E2E,
configs, scripts and tooling sit outside the table; within-role imports obey slice isolation. A slice
imports no sibling slice. ESLint checks static relative references, including types, in every result;
computed specifiers and non-relative aliases remain gaps. Fallow child zones also check `apps/web` routes.
Shared code lives in features or UI; role-named folders make PR scope visible.

Record decisions, alternatives and trade-offs in ADRs; comments explain a line's local reason. ESLint caps
package TypeScript comment groups at four lines; review judges decision content. The cap elsewhere and an
ADR check for every new decision remain targets (`pnpm check:adr` covers new dependencies only).

### 3. Duplicate feature UI and share UI components

Duplicate feature UI and helpers case by case to limit coupling. Keep global UI components and style tokens
once in the UI package; lint enforces their use.

### 4. The compiler is a gate

Strict TypeScript is the first gate. Effect Schema defines every schema, including form validation through
the React Hook Form resolver and tRPC inputs. Schema changes make the compiler identify affected code. Run
Effect only at integration boundaries; keep pure logic as plain functions.

### 5. State lives in custom hooks

Lint confines `useState` and `useEffect` to custom `use*` hooks. Components derive values during render.
TanStack Query owns server state; React Hook Form owns forms.

### 6. Proof the agent can see

Agents verify their work through the Playwright behaviour map and accessibility scan.

### 7. Fast CI

Keep CI fast: it is the agent's whole feedback loop. Local hooks mirror it.

### 8. The unit of delivery is a merge-ready PR

Deliver one PR, green on every required check at its latest commit, up to date with `main`, and described
well enough to approve under the [PR quality contract](../.agents/project/PR_QUALITY.md). A person approves,
merges and deploys.

### 9. Declarative over imperative

Write transforms over `const` with `map`, `filter`, `flatMap`, `some`, `every`, `find`, `reduce` and
`Object.fromEntries` instead of loops, `let` accumulators, `push` or in-place mutation. Use `reduce` for one
value; build arrays and objects with `map`, `flatMap` and `Object.fromEntries`. Biome rejects accumulating
spread. Biome `style/useConst` and React Hooks immutability, globals and purity rules cover single-assignment
bindings and mutation during render in package TypeScript. ESLint now rejects loops and parameter
reassignment, including parameter property mutation
([ADR 0079](../.agents/decisions/0079-no-advisory-lint.md)). General reassignment and other mutation remain
held by [review](../REVIEW.md). Biome's `noForEach` and `useForOf` stay off because they steer
toward loops.

## Decisions settled on 2026-10-15

[ADR 0006](../.agents/decisions/0006-gap-review-decision-set.md) indexes the eight decisions:

1. Protected enforcement paths follow [ADR 0023](../.agents/decisions/0023-protect-only-the-files-that-run-the-gates.md)
   and later amendments, matching [GUARDS](../scripts/enforcement-approval.mjs):
   `.github/workflows/**`, `.husky/**`, `eslint.config.js`, `commitlint.config.ts`,
   `tooling/eslint-plugin-policy.js`, `scripts/check-suppressions.mjs`,
   `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts`,
   `biome.json`, `vendor/anti-slop/**`, any `.oxlintrc.json` or `oxlint.config.*`,
   `docs/prd/**` and `docs/NORTH_STAR.md`. Keep checks against suppressions,
   deleted/skipped/`.only` tests and coverage excludes.
2. Make this the reference monorepo and drop the two demo features.
3. Move the unchanged app to `apps/web` in PR0, then target it with nine enforcement PRs.
4. Lint ownership follows §1.
5. Effect follows §4; land it before TanStack Query and React Hook Form.
6. State follows §5.
7. Keep one role table; routes compose features and UI, with shared code there (§2).
8. Fallow 3.x owns graph, gate and diagrams from `.fallowrc.jsonc`. CI rejects forbidden
   imports, stale committed role diagrams and stale API reports. Commit an API
   Extractor report for each public module entry so export changes get reviewed.

### Considered and set aside

Set aside the new-file rule, trials, separate agent identity, separate approval-check decision and
guardrails PR form. Keep plan PR 1 (enforcement-change detection) and PR 9 (checkbox approval with an audit
trail).

## Where the template stands

The workspace has `apps/web` (Vite + React), `apps/api` (tRPC) and `packages/ui`. [Tech
stack](../.agents/project/TECH_STACK.md) and [quality gates](../.agents/project/QUALITY_GATES.md) track
installed tooling, including strict TypeScript, Jest, Playwright, axe, bundle budgets, dead
code/cycle/complexity checks, hook parity and PR-body validation. Update both guides whenever a PR changes a
tool. PR0 landed as #89; the monorepo, Effect schemas at every boundary, lint ownership, state hooks,
enforcement sign-off, architecture checks and role-named folders are installed. Every `.agents/` rule names
its gate or says "Not enforced yet" in AGENTS.md and Conventions. Human-written REVIEW.md guides Cursor
Bugbot, Codex and Claude after lint; `pnpm check:context` checks that wiring. Declarative and ADR-content
limits remain as described in §9 and §2; pre-commit timing remains review-held (§1). Cloud agents triggered
by tickets, alerts or schedules come last, once the repository is factory-shaped.

## Done criteria for a new rule

Call a target installed only when:

1. A hook, script or workflow fails on a deliberate violation.
2. It passes on the clean tree and runs on a clean checkout in CI.
3. Checks cover known routes around it.
4. Guidance in `.agents/` names the gate beside the rule.

Until then, describe it as a target.

## Sources

- Sarah Fim, "Agents ≠ Software Factory" (video post):
  <https://x.com/sarahfim/status/2108298553823203613>
- Sarah Fim, "How to build an anti-slop software factory for teams of 30+":
  <https://x.com/sarahfim/status/2109736893198016898>
