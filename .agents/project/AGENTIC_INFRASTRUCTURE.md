# Agentic Infrastructure

Agentic infrastructure is the repo-level system that lets agents produce
consistent work: instructions, context, templates, hooks, workflows, and proof.
It is not a README flourish. It is part of the engineering surface.

## The layer model

Each layer has one job:

| Layer | Artifact | Job |
| --- | --- | --- |
| Tool import | `.claude/CLAUDE.md` | Import `AGENTS.md` for Claude Code. |
| Entry contract | `AGENTS.md` | Tool-agnostic rules every agent follows, and the map. |
| Tool adapter | `.agents/CLAUDE_CODE.md` | Claude-specific skills, hooks, and workflow notes. |
| Project context | `.agents/project/` | Durable standards and facts. |
| Decisions | `.agents/decisions/` | Why the standards exist and when they changed. |
| Templates | `.agents/templates/` | Copyable code and test shapes. |
| Local gates | `.husky/` and `scripts/` | Fast feedback before commit and push. |
| Remote gates | `.github/workflows/` | Clean-checkout proof on every PR. |
| Skills | `.claude/skills/` | Reusable agent workflows for repeated jobs. |

If a rule appears in the wrong layer, agents either miss it or duplicate it.
Move the rule to the layer that owns it.

For anti-slop, `scripts/anti-slop-changed.mjs` is the agent-facing check of
advisory findings on committed changed lines. The
[push workflow](../../AGENTS.md#before-you-push) and
[review checklist](../../REVIEW.md#anti-slop-findings) own the responses to
those findings. `vendor/anti-slop/UPSTREAM.md` is the provenance record for
the pinned, hash-checked upstream source.

## Build order for a new repo

1. **Inventory truth.** Read package scripts, workflows, hooks, tests, build
   config, dependency tooling, and deployment surfaces before writing guidance.
2. **Write the operating contract.** `AGENTS.md` says how to work here,
   where to read next, what commands matter, and which gates always run.
   `.claude/CLAUDE.md` imports it with `@../AGENTS.md`.
   `.agents/CLAUDE_CODE.md` adds only Claude-specific skills, permissions, and
   hooks.
3. **Create project context.** Add architecture, conventions, tech stack,
   glossary, Definition of Done, ADRs, and templates under `.agents/`.
4. **Make gates match the claims.** Every "done" rule should be enforced by a
   command, hook, workflow, or explicit review check.
5. **Package repeated work as skills.** If agents will perform a workflow more
   than once, put the workflow in `.claude/skills/` instead of rediscovering it.
6. **Verify and publish proof.** Run the relevant local gates, then rely on CI as
   the clean-checkout proof.

## Truth rules

- Claim a gate only when its hook, script, or workflow exists.
- Document only commands that pass in a clean checkout.
- Describe current architecture as fact, and mark future architecture as a
  target or an ADR.
- Treat `docs/prd/**` and `.agents/NORTH_STAR.md` as product intent: every
  addition, edit, deletion or rename waits for sign-off from
  the approver (repo variable `ENFORCEMENT_APPROVER`, default `BenSheridanEdwards`)
  on the PR head through `enforcement-approval`. Intent changes are judged
  independently of enforcement tightening or loosening
  ([ADR 0060](../decisions/0060-product-intent-needs-sign-off.md)). Other agent
  guidance stays outside that guard.
- Keep the operating contract in `AGENTS.md`; `.agents/` carries the detail.
- Keep private project facts out of this public template.

## What makes it north-star quality

- Agents can start from `AGENTS.md`, follow one link, and find every relevant
  standard.
- Tool-specific instructions are isolated and replaceable.
- The Definition of Done maps to executable gates.
- PR proof separates local checks, CI, visual/runtime evidence, and gaps.
- The repo includes skills for the workflows agents repeat.
- A brownfield repo can copy the pattern one layer at a time without adopting a
  different product stack.
