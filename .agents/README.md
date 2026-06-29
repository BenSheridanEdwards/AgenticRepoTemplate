# `.agents/` — the repository's context for agents

This folder is the **single source of truth for how code is built here**. It is
written for an AI agent (and any new engineer) who lands in the repo with no
prior context and must produce work indistinguishable from the team's.

`AGENTS.md` and `CLAUDE.md` at the repo root are deliberately short. They state
the rules of engagement and then point *here* for the detail. Keeping the detail
in one place means there is exactly one thing to update when the way we work
changes — no drift between three half-maintained instruction files.

## What is here, and when to read it

| Path | Read it when… |
| --- | --- |
| [`project/AGENTIC_INFRASTRUCTURE.md`](project/AGENTIC_INFRASTRUCTURE.md) | …before changing agent guidance, hooks, workflows, or skills. |
| [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md) | …before adding or moving any module. It is the pattern you must follow. |
| [`project/CONVENTIONS.md`](project/CONVENTIONS.md) | …while writing code — naming, structure, imports, errors, state. |
| [`project/DEFINITION_OF_DONE.md`](project/DEFINITION_OF_DONE.md) | …before you claim a task is finished. The gates enforce this list. |
| [`project/PR_QUALITY.md`](project/PR_QUALITY.md) | …before opening, updating, or marking a pull request ready. |
| [`project/TECH_STACK.md`](project/TECH_STACK.md) | …to know which tool owns which concern (and what *not* to add). |
| [`project/GLOSSARY.md`](project/GLOSSARY.md) | …when you meet a domain term. Use these words exactly, in code and prose. |
| [`decisions/`](decisions/) | …to understand *why* a constraint exists before you challenge it. ADRs. |
| [`templates/`](templates/) | …when creating a new component, test, E2E flow, or StyleProof surface. Copy from here. |

## The contract

1. **Read before you write.** The patterns here are not suggestions; the quality
   gates mechanically reject code that ignores them.
2. **Follow the templates.** A new file should look like its template with the
   blanks filled in. Consistency is the product.
3. **If a rule is wrong, change the rule — in the open.** Propose an ADR in
   `decisions/`, do not quietly diverge. The setup is designed to evolve, not to
   be worked around.
