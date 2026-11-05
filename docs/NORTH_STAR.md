# North Star

## What it is

AgenticRepoTemplate is a software factory template. It is more than a repo skeleton. A
software factory is a repository any agent can operate in, on any model or harness. Its executable
standards refuse code outside the project's conventions. Downstream repos operate on this
foundation. The TypeScript, React and tRPC greeting app is the runnable example that gives every gate real
code to check.

## Who it is for

- The maintainer, who builds other repos on this template.
- The repos built on it.
- Any person whose agent clones the template from open source.

## The problem

Agents write slop. Slop is code more complex than the change needs, or code that breaks a convention the
repository agreed. Written instructions alone fail to stop it, so an agent repeats the same mistake. A green
PR also fails to tell the reviewer how much to trust it
([ADR 0064](../.agents/decisions/0064-merge-confidence-label.md)). A person needs evidence in the PR to make
a high-confidence merge decision. Without it, velocity with AI stays low.

## Goals

1. Give back to open source, and show in the open how an agent-run software factory operates.
2. Be the foundation every other repo operates on. A change here has real consequences for the repos
   downstream.

## What it does

- It makes agents write declarative, readable code ([§9](#9-declarative-over-imperative)).
- It enforces the architecture boundaries the maintainer defines: the role table, slice isolation and route
  co-location ([§2](#2-layers-import-downward-slices-stand-alone-decisions-live-in-adrs)).
- Its anti-slop rules and skills produce clean, maintainable code. Oxlint runs
  the vendored [dmmulroy/anti-slop](../vendor/anti-slop/UPSTREAM.md) rules through `pnpm lint:anti-slop`
  ([ADR 0070](../.agents/decisions/0070-vendored-anti-slop-oxlint-rules.md)), and `pnpm lint:policy` runs
  the policy rules of [ADR 0050](../.agents/decisions/0050-anti-slop-lint-policies.md).
- It puts evidence in each PR, so a person can make a high-confidence merge decision
  ([§8](#8-the-unit-of-delivery-is-a-merge-ready-pr)).

Lint carries most of the load and stays red until the agent fixes it. Close the routes around each refusal.
Domain docs inform the agent; gates decide what lands. Use [AGENTS.md](../AGENTS.md) for operating rules,
[TECH_STACK.md](../.agents/project/TECH_STACK.md) for installed tools,
[QUALITY_GATES.md](../.agents/project/QUALITY_GATES.md) for checks, and [ADRs](../.agents/decisions/) for
settled decisions.

## The reproducibility test

The reproducibility test asks whether the template makes code repeatable. Delete the Todo app. Have the same
model generate it again, twice, from the same brief and the same scaffold. Compare the results and find
where they diverge. On each edge case, decide whether the code is what a senior engineer would write.

The trial harness runs the generation and the comparison. `pnpm trial` builds the Todo brief in
`tooling/trial/todo-prompt.md` in a fresh session with no human help, and records its evidence
([ADR 0034](../.agents/decisions/0034-trial-harness-and-evidence.md)). The harness runs three trials per
agent, for Claude and for Codex ([ADR 0048](../.agents/decisions/0048-trial-tasks-and-codex.md)).
`node tooling/trial/compare.mjs` writes `docs/trials/comparison.md`. It gives the full pass count and
classifies each difference against the spec freedoms
([ADR 0035](../.agents/decisions/0035-trial-comparison.md)). It fails unless every run passed and the
results are consistent. A different file layout or mutation output is inconsistent
([ADR 0069](../.agents/decisions/0069-trial-comparison-fixes-file-layout-and-mutation-outputs.md)).
The Notes brief is a second test ([ADR 0071](../.agents/decisions/0071-a-second-trial-brief.md)).
[TRIALS.md](../.agents/TRIALS.md) is the runbook.

On 26 October 2026, commit `9ee8e71` cleared the 23 October Todo results and their comparison for a rerun.
The tree records no current Todo result. `docs/trials/superseded/` keeps older Codex runs as evidence only.
Review holds the senior-engineer judgment on edge cases. It has no gate and stays a target.

## Sibling tools

The template connects to three tools. None of them is wired into this repo today.

- **StyleProof** proves visual changes. This repo removed it until it is fixed (#63). Playwright
  `toHaveScreenshot` is the stated fallback that rejects unapproved visual changes
  ([ADR 0052](../.agents/decisions/0052-playwright-visual-regression.md)).
- **BehaviourProof** proves test and contract changes. In this repo that evidence comes from the behaviour
  map, the PRDs and the Pact contract tests
  ([ADR 0104](../.agents/decisions/0104-web-api-contract-tests-with-pact.md)).
- **MergeFlow** brings all this evidence together for the merge decision. It needs revitalisation. It is
  a separate project, and this repo builds none of it. In this repo, the merge confidence label grades each
  PR from its required checks and named gaps ([ADR 0064](../.agents/decisions/0064-merge-confidence-label.md)).

## Outcome and how success is measured

The outcome is evidence in the PR that supports a high-confidence merge decision, so velocity with AI goes
up. Success means:

- Any person's agent can clone the template and produce PRs a named human can approve or redirect in
  minutes.
- Every written rule names its check.
- Every PR names its outcome, proves it with committed evidence, and states what would falsify it.
- Every gate change carries a human signature.

Installed measures:

- Every required check is green on the PR's latest commit (`Required gates`,
  [ADR 0017](../.agents/decisions/0017-required-gates-aggregate.md)).
- CI labels each PR `confidence: green`, `confidence: amber` or `confidence: red`
  (`.github/workflows/confidence.yml`, [ADR 0064](../.agents/decisions/0064-merge-confidence-label.md)).
  The `Changed-file coverage` required lane blocks a merge when a changed file has thin coverage
  ([ADR 0089](../.agents/decisions/0089-thin-coverage-blocks-the-merge.md)).
- The `PR quality` workflow checks that the PR body carries its proof (`scripts/validate-pr-body.mjs`).
- The `enforcement-approval` status holds a gate change until the approver (repo variable
  `ENFORCEMENT_APPROVER`) signs it off
  ([ADR 0024](../.agents/decisions/0024-sign-off-only-loosening-enforcement-changes.md)).
- The trial comparison reports the pass count and each divergence between results.

Targets, with no gate yet:

- A recorded reproducibility test on the current scaffold, with a named human's judgment on each divergence.
- A measure of velocity with AI.
- The open source goal. Its measure sits outside this repo.

## Non-goals

- It is not a repo skeleton. It is the factory: rules, gates, proof and the example they check.
- It stays lean. It shows the best ideas, and it adds a tool, rule or skill only when that earns its place.
  Prefer deletion, existing patterns and stdlib or platform features. A new dependency needs an ADR.
- MergeFlow is a separate project. This repo builds none of it.
- StyleProof is not a dependency here. Playwright screenshots own visual regression until a decision
  changes that.
- A person, not an agent, approves, merges and deploys ([§8](#8-the-unit-of-delivery-is-a-merge-ready-pr)).
- The greeting is an example for the gates, not a product feature set.
- The 2026-10-15 decisions set aside the new-file rule, a separate agent identity, a separate approval-check
  decision and the guardrails PR form.

## Principles

### 1. Lint beats instructions

When an agent gets something wrong twice, write a rule that blocks the change and explains the fix. Prose
and skills guide work; lint and CI enforce quality. Keep project skills when they earn their place; most
skills ship with the agent.

The toolchain combines Biome, Oxlint, strict TypeScript over four programs, Fallow boundaries and
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

Warnings fail Biome, Oxlint and React Doctor. [ADR 0079](../.agents/decisions/0079-no-advisory-lint.md) records
the maintainer's lint decision: every rule becomes an error or is removed, including Fallow's warning tier. That rollout is
not finished yet. A console warning or error fails a Jest test or a Playwright page
([ADR 0086](../.agents/decisions/0086-console-warnings-fail-tests.md)); warnings-as-failures across every
tool remains a target.

Oxlint ignores `eslint-*` directives; keep reasoned exceptions in `oxlint.config.ts`. `pnpm check:suppressions`
rejects every other inline suppression and coverage pragma across the repo; an exception lives in its reviewed
allowlist ([ADR 0084](../.agents/decisions/0084-reject-every-inline-suppression.md)).
[Conventions](../.agents/project/CONVENTIONS.md) names the enforcers.

Label standards without gates as targets. Close aliases, re-exports, inline disables and config edits around
a rule before calling it finished. Changes that loosen or rewrite enforcement need the approver's sign-off on the
exact commit ([ADR 0024](../.agents/decisions/0024-sign-off-only-loosening-enforcement-changes.md)). Biome
owns format and general lint; Oxlint owns policy, hooks, Compiler and React Doctor rules; the React Doctor CLI owns project checks.

### 2. Layers import downward, slices stand alone, decisions live in ADRs

[Architecture](../.agents/project/ARCHITECTURE.md) owns the role/folder/import/Fallow zone table. Value
imports flow downward; Fallow rejects unlisted edges and `coverage.requireAllFiles` rejects unassigned
source. Type-only imports may cross roles except into the UI package, subject to slice isolation and route
co-location. Tests, E2E,
configs, scripts and tooling sit outside the table; within-role imports obey slice isolation. A slice
imports no sibling slice. Oxlint checks static relative references, including types, in every result;
computed specifiers and non-relative aliases remain gaps. Fallow child zones also check `apps/web` routes.
Shared code lives in features or UI; role-named folders make PR scope visible.

Record decisions, alternatives and trade-offs in ADRs; comments explain a line's local reason. Oxlint caps
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
bindings and mutation during render in package TypeScript. Oxlint rejects loops (`policy/no-loops`) and parameter reassignment, including parameter property mutation
([ADR 0079](../.agents/decisions/0079-no-advisory-lint.md)). Oxlint also rejects redundant else after return
everywhere; result roots reject nested ternaries, lonely if, array forEach, sort and reverse,
and prefer find, some, flat and Object.fromEntries. Browser globals belong only in web main.tsx.
[Native declarative lint](../.agents/decisions/0108-native-declarative-lint.md) records the scopes.
Result roots also enforce `policy/no-let`, `policy/no-mutation`, `policy/no-classes` and `policy/no-switch`. [Declarative policy lint](../.agents/decisions/0109-declarative-policy-lint.md) records selectors and exemptions. Review holds mutation in tests and integrations, collection mutators and computed method calls. Biome's `noForEach` and `useForOf` stay off because they steer
toward loops.

## Decisions settled on 2026-10-15

[ADR 0006](../.agents/decisions/0006-gap-review-decision-set.md) indexes the eight decisions:

1. Protected enforcement paths follow [ADR 0023](../.agents/decisions/0023-protect-only-the-files-that-run-the-gates.md)
   and later amendments, matching [GUARDS](../scripts/enforcement-approval.mjs):
   `.github/workflows/**`, `.github/actions/**`, `.husky/**`, `commitlint.config.ts`,
   `tooling/oxlint-plugin-policy.js`, `scripts/check-suppressions.mjs`,
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
guardrails PR form. [ADR 0034](../.agents/decisions/0034-trial-harness-and-evidence.md) later added the
trial harness that runs the reproducibility test. Keep plan PR 1 (enforcement-change detection) and PR 9
(checkbox approval with an audit trail).

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

## Open questions

1. Which repos count as downstream, and how does a breaking change here reach them?
2. Which number measures velocity with AI, and where does the repo record it?
3. The test says "the same model twice"; the harness runs three trials per agent. Which model, how many
   runs, and how often?
4. Does a divergence on an edge case fail a gate, or does review hold it? Where is the named human's
   judgment recorded?
5. Where do BehaviourProof and MergeFlow live, and what is their status? Who revitalises MergeFlow?
6. Once StyleProof is fixed, does it replace the Playwright screenshots of ADR 0052 or run beside them?
7. Which anti-slop skills does the maintainer mean: the vendored lint rules, the `ponytail` skill, or skills to add?
8. What test decides that an idea leaves the template to keep it lean?
