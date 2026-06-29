# Agentic Infrastructure

Agentic infrastructure is the repo-level system that lets agents produce
consistent work: instructions, context, templates, hooks, workflows, and proof.
It is not a README flourish. It is part of the engineering surface.

## The layer model

Each layer has one job:

| Layer | Artifact | Job |
| --- | --- | --- |
| Entry contract | `AGENTS.md` | Tool-agnostic rules every agent follows. |
| Tool adapter | `CLAUDE.md` | Claude-specific skills, hooks, and workflow notes. |
| Project context | `.agents/project/` | Durable standards and facts. |
| Decisions | `.agents/decisions/` | Why the standards exist and when they changed. |
| Templates | `.agents/templates/` | Copyable code and test shapes. |
| Local gates | `.husky/` and `scripts/` | Fast feedback before commit and push. |
| Remote gates | `.github/workflows/` | Clean-checkout proof on every PR. |
| Skills | `.claude/skills/` | Reusable agent workflows for repeated jobs. |

If a rule appears in the wrong layer, agents either miss it or duplicate it.
Move the rule to the layer that owns it.

## Build order for a new repo

1. **Inventory truth.** Read package scripts, workflows, hooks, tests, build
   config, dependency tooling, and deployment surfaces before writing guidance.
2. **Write the thin entry points.** `AGENTS.md` says how to work here, where to
   read next, what commands matter, and what must never be bypassed. `CLAUDE.md`
   adds only Claude-specific skills, permissions, and hooks.
3. **Create project context.** Add architecture, conventions, tech stack,
   glossary, Definition of Done, ADRs, and templates under `.agents/`.
4. **Make gates match the claims.** Every "done" rule should be enforced by a
   command, hook, workflow, or explicit review check.
5. **Package repeated work as skills.** If agents will perform a workflow more
   than once, put the workflow in `.claude/skills/` instead of rediscovering it.
6. **Verify and publish proof.** Run the relevant local gates, then rely on CI as
   the clean-checkout proof.

## Truth rules

- Do not claim a gate exists unless the hook, script, or workflow exists.
- Do not document commands that fail in a clean checkout.
- Do not describe a future architecture as current fact. Mark it as a target or
  create an ADR.
- Do not let root instructions drift from `.agents/`. The root files point in;
  `.agents/` carries the detail.
- Do not put private project facts in this public template.

## What makes it north-star quality

- Agents can start from `AGENTS.md` and find every relevant standard.
- Tool-specific instructions are isolated and replaceable.
- The Definition of Done maps to executable gates.
- PR proof separates local checks, CI, visual/runtime evidence, and gaps.
- The repo includes skills for the workflows agents repeat.
- A brownfield repo can copy the pattern one layer at a time without adopting a
  different product stack.
