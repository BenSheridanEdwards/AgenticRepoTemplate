# North Star

> The direction this template moves in. Read it to understand *why* a gate
> exists or *which* gate to build next. For how to work today, read
> [`AGENTS.md`](AGENTS.md); for what is installed, read
> [`.agents/project/TECH_STACK.md`](.agents/project/TECH_STACK.md) and
> [`.agents/project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md).

## The thesis

**The factory is the repository.** Not the model, not the harness. The
repository holds the machinery: types, lint, tests, CI, and the PR contract.
Anyone should be able to bring their own agent, on any harness and any model,
and find it almost impossible to land bad code.

Skills are valuable. They teach agents *how to do* a workflow — operating
procedures that preferably come with the agent, with project-specific ones
welcome in the repo when they earn their place. They are not the factory's
enforcement layer. Code quality and conventions are enforced by lint and CI;
skills do not compete for that job.

The reason the factory matters is that **slop compounds**. In a soft repository
an agent slops a plan, slops the implementation, then reviews its own slop.
Repeat that across many contributors and many agents and the codebase degrades,
approvals slow down, and velocity falls over time. The fix is not a better
prompt. It is a repository that refuses bad changes, and refuses every route
around the refusal.

This extends the beliefs in the [README](README.md): executable standards beat
written standards, and consistency is infrastructure. Repo docs still matter
for domain-specific knowledge; they inform the agent. They do not replace the
gates.

**What success looks like:** any person's agent, on any harness or model, can
clone a repository built from this template and open only pull requests a named
human can approve or redirect in minutes. The repository, not the agent, makes
the wrong change hard to land. Every written rule names the check that enforces
it. Every PR names the outcome it moves, proves it with committed evidence, and
states what would falsify it. No gate weakens without a human signature.

## Principles

### 1. Lint beats instructions

The right comparison is lint versus agent instructions and repo prose
(`AGENTS.md`-style rules), not lint versus skills. Those are different jobs.

Prose instructions in the repo do little to stop slop. They get ignored and go
out of date. Linting is the guard against slop: a lint rule closes the loop —
it blocks the change and tells the agent what it broke and how to fix it. When
an agent gets something wrong twice, the answer is a rule, not another
paragraph.

Skills are a different thing entirely. They provide operating procedures for
how an agent should behave and how to run a workflow. They have nothing to do
with linting and should not be compared as if they competed for the same job.
Do not use skills to enforce code standards. Prefer skills that ship with the
agent; put project-specific skills in the repo when useful, never as the
mechanism that enforces quality. Domain docs in the repo remain welcome for
project knowledge.

A standard with no gate behind it is a target, and is labelled as one.

A rule is only finished when the routes around it are closed too: aliases,
re-exports, inline disables, and edits to the rule's own config.

Biome owns lint. Custom rules try Biome first; adding ESLint for rules Biome
cannot express is an ADR, not a quiet addition.

### 2. Co-locate by feature

A feature owns its view, state wiring, logic, and tests in one folder under
`src/features/`, as [ARCHITECTURE.md](.agents/project/ARCHITECTURE.md)
describes. A reviewer can see a PR's exact scope from the paths it touches.

There are no junk drawers. Broad `lib/` and `utils/` folders are where
unrelated helpers pile up and agents learn to dump code, so they do not exist.
`src/shared/` is not a junk drawer: each module in it is a deliberate shared
primitive with its own public `index.ts`, and moving code there is a decision,
not a default.

### 3. Duplicate feature UI; share only primitives

Generated code is cheap and coupling is expensive. Feature-level UI and helpers
may be duplicated case by case rather than abstracted early. The exception is
global primitives (components such as buttons, and style tokens): those exist
once, and lint enforces their use.

### 4. The compiler is a gate

`strict` TypeScript is the first gate. Contracts should be typed end to end, so
a schema change makes the compiler list everything else that must change.

### 5. Proof the agent can see

Agents verify their own work through the behaviour map (Playwright E2E), the
accessibility scan, and StyleProof's computed-style diff. Behaviour and looks
are separate truths and both are checked.

### 6. Fast CI

CI is the whole feedback loop, so its speed is the agent's iteration speed.
Keep it fast, and keep local hooks mirroring it.

### 7. The unit of delivery is a merge-ready PR

Every piece of work ends as one pull request that is:

- **green** on every required check, on the latest commit;
- **up to date with `main`**;
- **described well enough to approve from**, following the
  [PR quality contract](.agents/project/PR_QUALITY.md).

The agent never merges and never deploys. A person approves and merges.

## Where the template stands

**Installed today:** feature slices under `src/features/` with co-located tests;
`src/shared/` modules with public surfaces; Fallow boundary zones that fail on
cross-feature imports (`.fallowrc.jsonc`); `strict` TypeScript; Biome for lint
and format (recommended preset, no custom rules yet); Fallow for dead code,
cycles, and complexity; Jest, Playwright, axe, and StyleProof; husky hooks
mirroring CI; PR body validation; and a hook that refuses `--no-verify`.

**Next machinery (targets — land each as its own merge-ready PR):**

| Target | What it adds | Status |
| --- | --- | --- |
| No junk drawers | `lib/` and `utils/` folders fail a check, not just a convention | Not enforced |
| Rule → enforcer table | Every rule in `.agents/` names its gate, or says "Not enforced yet" | Not present |
| React Doctor | React rules that fail CI, run beside Biome | Target; ADR on the lint stack before install |
| Ban casual `useState`/`useEffect` | Raw state and effect hooks need a stated reason a purpose-built tool will not work | Not enforced; current features still use them |
| TypeScript Effect | `effect` with Effect Schema for new typed schemas | Not installed |
| `REVIEW.md` (Sarah's BUGBOT.md idea) | Human-written review rules for PR review bots, after lint, never instead of it | Not present |
| Cloud agents | Agents triggered from tickets, alerts, or schedules | Last, once the repository is factory-shaped |

This document names the factory method and the next machinery. Ticketed forward
work with acceptance criteria lives in [`TODO.md`](TODO.md). Adding a tool is
an ADR-level decision under [`TECH_STACK.md`](.agents/project/TECH_STACK.md);
Biome stays the owner of lint and format until an ADR says otherwise.

## Done criteria for a new rule

A standard moves from target to installed when:

1. a hook, script, or workflow enforces it and fails on a deliberate violation;
2. it passes on the clean tree and runs on a clean checkout in CI;
3. the known routes around it are covered;
4. the guidance in `.agents/` names the gate beside the rule.

Until then, docs describe it as a target, never as current fact.

## Sources

- Sarah Fim, "Agents ≠ Software Factory" (video post):
  <https://x.com/sarahfim/status/2108298553823203613>
- Sarah Fim, "How to build an anti-slop software factory for teams of 30+":
  <https://x.com/sarahfim/status/2109736893198016898>

This template keeps skills first-class for agent behaviour. Where Sarah sets
skills aside relative to the factory, we diverge: skills teach workflows;
lint and CI enforce standards.
