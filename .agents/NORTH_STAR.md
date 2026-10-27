# North Star

> A software factory is a repository that any agent can operate in, and is
> forced to produce great code in line with the project's standards. It is
> **agent-agnostic** and works the same for any model and any harness. The
> linter forces those standards. It is tightly configured to flag bad code
> early, and it stays red until the agent closes the loop.

## The factory is the repository

The repository holds the machinery: types, lint, tests, CI, and the PR
contract. Any agent, on any model or harness, meets the project's standards
because the repository refuses changes that miss them. The linter carries most
of that load.

**Slop** is an agent writing code that is more complex than the change needs,
or that breaks the conventions this repository agreed: a loop where a
transform fits, a mutable accumulator, a second way to fetch data, an import
across a slice, a decision explained in a long comment in place of an ADR.
Slop compounds. In a soft repository an agent slops a plan, slops the
implementation, then reviews its own slop. Repeat that across many
contributors and many agents and the codebase degrades, approvals slow down,
and velocity falls. The fix is a repository whose toolchain refuses code that
breaks the agreed conventions, and that closes every route around each
refusal.

This extends the beliefs in the [README](../README.md): executable standards beat
written standards, and consistency is infrastructure. Domain docs in the repo
inform the agent. The gates decide what lands.

For day-to-day operating rules see [Start here](START_HERE.md). For what is
installed today see [`.agents/project/TECH_STACK.md`](project/TECH_STACK.md)
and [`.agents/project/QUALITY_GATES.md`](project/QUALITY_GATES.md).
Settled decisions live as ADRs in [`.agents/decisions/`](decisions/).

**What success looks like.** Any person's agent, on any harness or model, can
clone a repository built from this template and open only pull requests a named
human can approve or redirect in minutes. The repository, not the agent, makes
the wrong change hard to land. Every written rule names the check that enforces
it. Every PR names the outcome it moves, proves it with committed evidence, and
states what would falsify it. Every gate change carries a human signature.

## Principles

### 1. Lint beats instructions

Compare lint with agent instructions and repo prose, such as `AGENTS.md`-style
rules. Prose rules get skipped and go stale. A lint rule closes the loop. It
blocks the change and tells the agent what broke and how to fix it. When an
agent gets something wrong twice, write a rule.

The toolchain holds the conventions with lint rules (Biome and ESLint), type
rules (`strict` TypeScript over four programs) and architecture tests (Fallow
boundaries, the `contract/<id>` rule pack and the structure check), plus unit
and E2E tests:

- **At pre-commit**, `.husky/pre-commit` runs `pnpm typecheck`, staged
  Biome lint and format, `pnpm fallow:audit` (including complexity) over the
  files the change touches, and gitleaks on staged content. Each pre-commit
  step must finish in under 30 seconds on a realistic staged change. Review
  examines slower steps carefully for a likely move to pre-push
  ([ADR 0062](decisions/0062-pre-commit-steps-stay-under-30-seconds.md)).
  **Before every push**, `.husky/pre-push` checks that every pushed branch
  contains a freshly fetched `origin/main`, then runs `pnpm verify` and
  `pnpm e2e`: ESLint policy lint, React Doctor, the architecture gate and
  structure check, the diagrams and API reports, the tests and the
  production build. CI re-runs every gate on a clean checkout. Git skips
  pre-commit on a conflict-free merge
  ([ADR 0028](decisions/0028-pre-push-runs-the-full-local-gate-suite.md));
  `scripts/fallow-audit.sh` skips its audit when a base branch is absent.
  Running every convention check before every commit remains a target,
  within the 30-second budget. Review holds the budget through recorded
  measurements; timing enforcement is documentation only.
- **Common skipping attempts are refused.** The PreToolUse hook
  [`block-gate-bypass.sh`](../.claude/hooks/block-gate-bypass.sh) blocks
  `--no-verify`, `git commit -n`, `HUSKY=0` and rewrites of `core.hooksPath`,
  git aliases or config includes in Claude Code, and in Codex sessions that
  trust project hooks. It is a speed bump with known gaps
  ([ADR 0027](decisions/0027-block-common-hook-bypasses.md)); CI on a clean
  checkout is the backstop; required branch checks make it a merge gate
  ([hosted setup](../docs/hosted-security.md)).
- **Warnings fail Biome, ESLint and React Doctor.** Biome runs with
  `--error-on-warnings`, ESLint with `--max-warnings=0`, and React Doctor with
  `--blocking warning`
  ([ADR 0046](decisions/0046-fail-lint-on-warnings.md)). Fallow warning-level
  findings remain nonblocking; Jest and Playwright console warnings also
  pass. Warnings-as-failures across every tool remains a target.
- **ESLint disable comments are ignored.** ESLint sets `noInlineConfig`, so it
  applies no inline `eslint-disable` comment and fails the run on each one
  ([ADR 0039](decisions/0039-block-inline-lint-disable-comments.md)). An
  ESLint exception lives in `eslint.config.js` with its reason. The other
  engines accept a suppression that names its reason (`biome-ignore`,
  `@ts-expect-error`, `fallow-ignore`) outside result roots. The structure
  check's `suppression` rule rejects those directives, ESLint directives and
  coverage pragmas in both `apps/` and `showcase/<id>/`. Coverage pragmas
  outside those roots remain a review concern.

Skills are agent operating procedures. They teach an agent how to run a
workflow, and they are valuable. Most ship with the agent, and the repo adds
project-specific skills when they earn their place. Lint and CI enforce code
quality. Skills guide how the agent works.

A standard with no gate behind it is a target and is labelled as one. A rule is
finished when the routes around it are closed too: aliases, re-exports, inline
disables, and edits to the rule's own config. A change that loosens or rewrites
a rule waits for Ben's sign-off on the exact commit
([ADR 0024](decisions/0024-sign-off-only-loosening-enforcement-changes.md)).

Each lint engine owns its own concerns. Biome owns format and general lint.
ESLint owns policy rules and the React hooks and Compiler rules. React Doctor
rules block through ESLint where a plugin rule exists, and React Doctor itself
enforces the rest in CI.

### 2. Layers import downward, slices stand alone, decisions live in ADRs

[ARCHITECTURE.md](project/ARCHITECTURE.md) holds one table that maps each role
to its folder, its allowed imports, and the Fallow zone that enforces it. The
roles form layers, and each layer imports only the layers below it: a route
composes features, the api client and the UI package; a procedure calls
application; application calls domain and integrations; the domain and the UI
package import no other role by value. Fallow fails a value import the table
leaves out, and `coverage.requireAllFiles` fails an in-scope source file in
no role (`pnpm arch:gate`).
A type-only import may cross between any two roles
([ADR 0037](decisions/0037-type-only-edges-and-flagged-re-exports.md)), so the
downward rule holds for values between roles. Imports within a role remain
allowed subject to slice isolation. Tests, E2E specs, configs, scripts and
tooling sit outside the role table.

A slice stands alone: one feature imports no other feature, and one route no
other route. ESLint `policy/slice-isolation` checks static relative module
references, including type imports, for every result; computed specifiers
and non-relative aliases remain a gap in that rule. Fallow child zones check
the `apps/web` routes a second time. Shared code lives in a feature or in the
UI package. Every folder is named for its role,
so a reviewer can see a PR's scope from the paths it touches.

Decisions live in decision records. The reason behind a choice, its
alternatives and its trade-offs go in an ADR in [`decisions/`](decisions/),
and a code comment keeps to the local reason for a line. ESLint
`policy/no-large-comments` caps each comment group at four lines in package
TypeScript source ([ADR 0050](decisions/0050-anti-slop-lint-policies.md)). It
measures length only, so review judges whether a comment records a decision
that belongs in an ADR. Not enforced yet: the comment cap outside package
TypeScript source, and a check that a new decision arrives with its ADR
(`pnpm check:adr` covers a new dependency only).

### 3. Duplicate feature UI and share UI components

Generated code is cheap and coupling is expensive. Feature-level UI and helpers
may be duplicated case by case. Global UI components, such as buttons, and style
tokens exist once in the UI package, and lint enforces their use.

### 4. The compiler is a gate

`strict` TypeScript is the first gate. Effect Schema defines every schema,
including form validation through the React Hook Form resolver and tRPC inputs.
A schema change makes the compiler list everything else that must change. The
Effect runtime runs only at integration boundaries, and pure logic stays as
plain functions.

### 5. State lives in custom hooks

`useState` and `useEffect` appear only inside custom `use*` hooks, and a lint
rule enforces that. Components calculate derived values during render. TanStack
Query owns server state and React Hook Form owns form state.

### 6. Proof the agent can see

Agents verify their own work through the behaviour map (Playwright E2E) and the
accessibility scan.

### 7. Fast CI

CI is the whole feedback loop, so its speed is the agent's iteration speed.
Keep it fast, and keep local hooks mirroring it.

### 8. The unit of delivery is a merge-ready PR

Every piece of work ends as one pull request that is:

- **Green** on every required check, on the latest commit.
- **Up to date with `main`**.
- **Described well enough to approve from**, following the
  [PR quality contract](project/PR_QUALITY.md).

A person approves, merges, and deploys.

### 9. Declarative over imperative

Write data transforms as expressions over `const` bindings: `map`, `filter`,
`flatMap`, `some`, `every`, `find`, `reduce` and `Object.fromEntries`, in
place of `for` and `while` loops, `let` accumulators, `push` and in-place
mutation. A declarative transform states what it produces, reads in one pass,
and leaves nothing for the next line to change. Use `reduce` when the result
is one value, and build arrays and objects with `map`, `flatMap` and
`Object.fromEntries`: Biome's recommended `performance/noAccumulatingSpread`
fails a `reduce` that spreads its accumulator.

Partly enforced today. Biome `style/useConst` fails a `let` that is assigned
only once, and the React Hooks rules `react-hooks/immutability`,
`react-hooks/globals` and `react-hooks/purity` fail mutation of props, state,
hook values and globals during render in package TypeScript source. Not
enforced yet: a rule against loops, reassignment and mutation in general.
Biome's loop rules
(`complexity/noForEach`, `style/useForOf`) point toward `for...of` and stay
off. Package source holds no loops today, but already contains reassignment;
scripts, tooling and some E2E specs contain loops. Until a rule lands with
its ADR, review holds this principle
([REVIEW.md](../REVIEW.md)).

## Decisions settled on 2026-10-15

The 2026-10-15 gap review settled eight decisions that shape the plan. The
reasoning lives as ADRs in
[`.agents/decisions/`](decisions/), indexed by
[0006](decisions/0006-gap-review-decision-set.md).

1. **Protected enforcement paths.** Root configs, `.github/**`, `.claude/**`,
   `.husky/**`, `scripts/**`, `tooling/**`, the lockfile, and the agent docs are
   protected by default. Content checks catch new suppression comments,
   deleted, skipped, or `.only` tests, and coverage excludes.
2. **Monorepo.** This template becomes the reference monorepo and drops the
   two demo features.
3. **Order.** PR0 moves the app into `apps/web` unchanged. The nine
   enforcement PRs then target `apps/web`.
4. **Lint ownership.** Biome owns format and general lint. ESLint owns policy,
   hooks, and compiler rules. React Doctor rules block through ESLint where
   possible and through React Doctor in CI otherwise.
5. **Effect.** Effect Schema defines every schema. The Effect runtime runs only
   at integration boundaries. The Effect PR lands before the TanStack Query and
   React Hook Form PR.
6. **State.** `useState` and `useEffect` live only inside custom `use*` hooks.
7. **Structure.** ARCHITECTURE.md holds one role table. Routes import features
   and the UI package, and shared code lives in features or the UI package.
8. **Architecture checks.** Fallow 3.x owns the dependency graph, the
   architecture gate, and the diagram, all read from `.fallowrc.jsonc`. CI
   fails on a forbidden import, on a stale committed role diagram, and on a
   stale API report. Each public module entry commits an API Extractor report,
   so export changes show as a reviewed diff.

### Considered and set aside

The review weighed and set aside five items: the new-file rule, the trials, a
separate agent identity, a separate approval-check decision, and a guardrails
PR form. Plan PR 1 (enforcement-change detection) and plan PR 9 (checkbox
approval with an audit trail) stay in the plan.

## Where the template stands

**Installed today.** The repo is a pnpm workspace:
`apps/web` holds the Vite + React app, `apps/api` the tRPC api, and
`packages/ui` the shared components, each file mapped onto the one role table
(#89, #90; [ADR 0031](decisions/0031-workspace-conversion.md),
[ADR 0032](decisions/0032-api-ui-greeting-and-contract.md)). Effect Schema
defines every boundary, forms and tRPC inputs alike, inside the bundle budget
(#90, #96; [ADR 0011](decisions/0011-effect-schema-everywhere.md),
[ADR 0036](decisions/0036-effect-4.md)). ESLint owns the policy, hook, and
compiler rules beside Biome, which formats and runs general lint (#61;
[ADR 0010](decisions/0010-lint-engine-ownership.md),
[ADR 0015](decisions/0015-eslint-policy-stack-wiring.md)). Fallow 3.x owns the
architecture graph, gate, and diagram from `.fallowrc.jsonc` and checks dead
code, cycles, and complexity, with a committed role diagram and an API
Extractor report per package (#62, #91;
[ADR 0014](decisions/0014-fallow-owns-architecture-checks.md),
[ADR 0033](decisions/0033-result-diagrams-and-structure-validation.md)). The
repo runs `strict` TypeScript, Jest, Playwright, and axe; Husky hooks mirror
the CI gates; a script validates PR bodies; and a hook refuses `--no-verify`
and the other common hook bypasses.

**The plan.** PR0 landed as #89, and every row in the table below is installed
except the rows marked partial or not enforced yet, and cloud agents, which
the table marks as last. Each PR that changes a tool also updates
`TECH_STACK.md` and `QUALITY_GATES.md` to match.

| Target | What it adds | Status |
| --- | --- | --- |
| Monorepo | The app in `apps/web`, then `apps/api` and `packages/ui` | Installed (#89, #90; ADR 0031, 0032) |
| Lint ownership | ESLint for policy, hooks, and compiler rules beside Biome | Installed (#61; ADR 0010, 0015) |
| React Doctor | Blocking React rules through ESLint, with React Doctor in CI for the rest | Installed (#61; ADR 0010) |
| Effect Schema | One schema idiom for forms, tRPC inputs, and external data | Installed (#90, #96; ADR 0011, 0036) |
| State in custom hooks | `useState` and `useEffect` only inside custom `use*` hooks, checked by lint | Installed, ESLint `policy/state-and-effects-in-hooks` |
| Enforcement sign-off | Ben ticks one checkbox, bound to the head commit, for each change that loosens or rewrites a gate ([ADR 0024](decisions/0024-sign-off-only-loosening-enforcement-changes.md)) | Installed |
| Pre-commit budget | Each `.husky/pre-commit` step must finish in under 30 seconds; review examines slower steps for a likely move to pre-push ([ADR 0062](decisions/0062-pre-commit-steps-stay-under-30-seconds.md)) | Review-held through recorded per-step measurements; documentation only |
| Architecture checks | Fallow 3.x gate, committed role diagram, and API Extractor reports | Installed (#62, #91; ADR 0014, 0033) |
| Role-named folders | `lib/`, `utils/` and the other catch-all folders fail a check | Installed, ESLint `policy/role-named-folders` |
| Rule-to-enforcer table | Every rule in `.agents/` names its gate, or says "Not enforced yet" | Installed, [`START_HERE.md`](START_HERE.md) and [`CONVENTIONS.md`](project/CONVENTIONS.md) |
| `REVIEW.md` | Human-written rules for automated PR review, read after lint by Cursor Bugbot, Codex, and Claude | Installed (#112; [ADR 0049](decisions/0049-review-rules-for-bot-reviewers.md)); `pnpm check:context` holds the wiring |
| Declarative code | Data transforms with `map`, `filter`, `flatMap` and `reduce` over `const`, in place of loops and mutation ([§9](#9-declarative-over-imperative)) | Partial: Biome `style/useConst`; ESLint `react-hooks/immutability`, `react-hooks/globals`, `react-hooks/purity`. Loops and general mutation: Not enforced yet |
| Decisions in ADRs | The reason for a decision lives in an ADR; a comment group keeps to four lines ([§2](#2-layers-import-downward-slices-stand-alone-decisions-live-in-adrs)) | Partial: ESLint `policy/no-large-comments` in package TypeScript source; decision content: Not enforced yet |
| Cloud agents | Agents triggered from tickets, alerts, or schedules | Last, once the repository is factory-shaped |

## Done criteria for a new rule

A standard moves from target to installed when:

1. A hook, script, or workflow enforces it and fails on a deliberate violation.
2. It passes on the clean tree and runs on a clean checkout in CI.
3. Checks cover the known routes around it.
4. The guidance in `.agents/` names the gate beside the rule.

Until then, docs describe it as a target.

## Sources

- Sarah Fim, "Agents ≠ Software Factory" (video post):
  <https://x.com/sarahfim/status/2108298553823203613>
- Sarah Fim, "How to build an anti-slop software factory for teams of 30+":
  <https://x.com/sarahfim/status/2109736893198016898>
