---
name: build-agent-guidance
description: >-
  Create or update repository guidance for agentic engineering. Use when working
  on AGENTS.md, CLAUDE.md, .agents/project files, agent instructions, repo
  conventions, Definition of Done, or guidance that tells agents how to work in a
  codebase.
---

# Build Agent Guidance

Use this skill to make a repository self-explanatory to agents without turning
the root docs into a second codebase.

## Read First

- `git status --short --branch`
- `package.json` or the repo's equivalent command manifest
- existing CI workflows, hooks, and scripts
- `AGENTS.md`, `CLAUDE.md`, and `.agents/`
- `.agents/project/AGENTIC_INFRASTRUCTURE.md` when present

## Process

1. **Inventory before writing.** Verify real commands, scripts, hooks,
   workflows, test runners, formatters, and deployment surfaces from files. Do
   not trust stale prose.
2. **Separate layers.** Keep `AGENTS.md` tool-agnostic. Put tool-specific
   behaviour in `CLAUDE.md`, `.claude/settings.json`, hooks, and skills. Put
   durable project knowledge in `.agents/`.
3. **Keep root docs thin.** `AGENTS.md` should answer: what this repo is, how to
   run it, golden rules, where to read next, and safety boundaries.
4. **Make `.agents/` canonical.** Put architecture, conventions, tech stack,
   glossary, Definition of Done, and ADRs under `.agents/`. If a rule needs more
   than a few lines, it belongs there, not in the root entry points.
5. **Tie claims to gates.** If guidance says "done means X", point to the hook,
   script, workflow, or command that enforces X. If no gate exists, either add
   one in a separate quality-gate change or state the rule as review-only.
6. **Flag inconsistencies.** If existing code follows one pattern and docs claim
   another, surface it. Update the docs to truth, fix the code, or record the
   gap.
7. **Verify the docs.** Run the repo's lightest relevant doc/format gate, then
   the full gate suite when guidance changes affect Definition of Done, scripts,
   hooks, or workflows.

## Layer Contract

- `AGENTS.md`: portable operating contract for any agent or engineer.
- `CLAUDE.md`: Claude-specific adapter, local skills, allowed commands, and
  hooks.
- `.agents/README.md`: index for project context.
- `.agents/project/`: durable standards and facts.
- `.agents/decisions/`: ADRs for choices that future agents must understand.
- `.agents/templates/`: copyable patterns for new code and tests.
- `.claude/skills/`: executable workflows for repeated agent jobs.

## Anti-Patterns

- Keep each rule in one place, in one wording.
- List only installed tools and gates that run.
- Keep private project names, secrets, customer data, and local paths out of a
  public template.
- Keep one owner per concern; a new tool for an owned concern changes the
  tech-stack contract through an ADR.

## Done When

- The guidance describes the current repo accurately.
- Every new or changed instruction has an owner: root contract, tool adapter,
  `.agents/` standard, hook, workflow, script, or ADR.
- Skill frontmatter validates with the skill validator when a skill changed.
- Verification commands and any remaining gaps are reported explicitly.
