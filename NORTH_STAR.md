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

The reason the factory matters is that **slop compounds**. In a soft repository
an agent slops a plan, slops the implementation, then reviews its own slop.
Repeat that across many contributors and many agents and the codebase degrades,
approvals slow down, and velocity falls. The fix is a repository that refuses
bad changes and closes every route around each refusal.

This extends the beliefs in the [README](README.md): executable standards beat
written standards, and consistency is infrastructure. Domain docs in the repo
inform the agent. The gates decide what lands.

For day-to-day operating rules see [`AGENTS.md`](AGENTS.md). For what is
installed today see [`.agents/project/TECH_STACK.md`](.agents/project/TECH_STACK.md)
and [`.agents/project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md).
Settled decisions live as ADRs in [`.agents/decisions/`](.agents/decisions/).

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

Skills are agent operating procedures. They teach an agent how to run a
workflow, and they are valuable. Most ship with the agent, and the repo adds
project-specific skills when they earn their place. Lint and CI enforce code
quality. Skills guide how the agent works.

A standard with no gate behind it is a target and is labelled as one. A rule is
finished when the routes around it are closed too: aliases, re-exports, inline
disables, and edits to the rule's own config. Enforcement paths are protected
by default, so a change to any rule needs a human sign-off.

Each lint engine owns its own concerns. Biome owns format and general lint.
ESLint owns policy rules and the React hooks and Compiler rules. React Doctor
rules block through ESLint where a plugin rule exists, and React Doctor itself
enforces the rest in CI.

### 2. One role table defines the structure

[ARCHITECTURE.md](.agents/project/ARCHITECTURE.md) holds one table that maps
each role to its folder, its allowed imports, and the Fallow zone that enforces
it. Routes compose pages from features and the UI package, and routes never
import other routes. Features hold domain code with co-located tests. Shared
code lives in a feature or in the UI package. Every folder is named for its
role, so a reviewer can see a PR's scope from the paths it touches.

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

Agents verify their own work through the behaviour map (Playwright E2E), the
accessibility scan, and StyleProof's computed-style diff. Behaviour and looks
are separate truths and both are checked.

### 7. Fast CI

CI is the whole feedback loop, so its speed is the agent's iteration speed.
Keep it fast, and keep local hooks mirroring it.

### 8. The unit of delivery is a merge-ready PR

Every piece of work ends as one pull request that is:

- **Green** on every required check, on the latest commit.
- **Up to date with `main`**.
- **Described well enough to approve from**, following the
  [PR quality contract](.agents/project/PR_QUALITY.md).

A person approves, merges, and deploys.

## Decisions settled on 2026-10-15

The 2026-10-15 gap review settled eight decisions that shape the plan. The
reasoning lives as ADRs in
[`.agents/decisions/`](.agents/decisions/), indexed by
[0006](.agents/decisions/0006-gap-review-decision-set.md).

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
7. **Structure.** ARCHITECTURE.md holds one role table. Routes never import
   routes, and shared code lives in features or the UI package.
8. **Architecture checks.** Fallow 3.x owns the dependency graph, the
   architecture gate, and the diagram. CI fails on a forbidden import and on a
   stale committed role diagram. Each package commits an API Extractor report,
   so export changes show as a reviewed diff. Fallow replaces
   dependency-cruiser in the plan.

### Considered and set aside

The review weighed and set aside five items: the new-file rule, the trials, a
separate agent identity, a separate approval-check decision, and a guardrails
PR form. Plan PR 1 (enforcement-change detection) and plan PR 9 (checkbox
approval with an audit trail) stay in the plan.

## Where the template stands

**Installed today.** The single app keeps feature slices with co-located tests
and shared modules with public entry points. PR0 maps them onto the role table.
Fallow 2.x boundary zones in `.fallowrc.jsonc` fail on cross-feature imports,
and Fallow 2.x also checks dead code, cycles, and complexity. The repo runs
`strict` TypeScript, Biome with its recommended preset for lint and format,
Jest, Playwright, axe, and StyleProof. Husky hooks mirror CI, a script validates
PR bodies, and a hook refuses `--no-verify`.

**The plan.** PR0 moves the app into `apps/web`. Plan PRs 1 to 9 follow in
order, with the Effect PR ahead of PR 4. Each PR that changes a tool also
updates `TECH_STACK.md` and `QUALITY_GATES.md` to match. Ticketed forward work
with acceptance criteria lives in [`TODO.md`](TODO.md).

| Target | What it adds | Status |
| --- | --- | --- |
| Monorepo | The app in `apps/web`, then `apps/api` and `packages/ui` | Decided, PR0 |
| Lint ownership | ESLint for policy, hooks, and compiler rules beside Biome | Decided, PR 2 |
| React Doctor | Blocking React rules through ESLint, with React Doctor in CI for the rest | Decided, PR 2 |
| Effect Schema | One schema idiom for forms, tRPC inputs, and external data | Decided, before PR 4 |
| State in custom hooks | `useState` and `useEffect` only inside custom `use*` hooks, checked by lint | Decided, PR 7 |
| Protected enforcement paths | Enforcement-change detection, then checkbox approval with an audit trail | Decided, PRs 1 and 9 |
| Architecture checks | Fallow 3.x gate, committed role diagram, and API Extractor reports | Decided |
| Role-named folders | `lib/` and `utils/` folders fail a check | Target |
| Rule-to-enforcer table | Every rule in `.agents/` names its gate, or says "Not enforced yet" | Target |
| `REVIEW.md` | Human-written rules for automated PR review, read after lint | Target |
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
