# Glossary — the project's ubiquitous language

Use these terms **exactly**, in identifiers, tests, commits, and prose. Shared
language is how an agent's output reads as if the team wrote it. When a new
domain term appears, add it here in the same change.

| Term | Meaning |
| --- | --- |
| **Feature** | A self-contained vertical slice under `src/features/`, exposing a public surface via `index.ts`. The unit of work. |
| **Public surface** | The exports in a feature's `index.ts` — the only things other modules may import. |
| **Behaviour map** | The end-to-end specs in `e2e/app.spec.ts` that define what the product does. The contract. |
| **Quality gate** | An automated check that can block a commit, a push, or a merge. Gates are code, not guidelines. |
| **Surface (StyleProof)** | A page state captured for computed-style diffing, declared in `e2e/styleproof.spec.ts`. |
| **Review-gate mode** | StyleProof posts a per-change report and holds a commit status until each visual change is approved. |
| **Certify mode** | StyleProof fails on *any* visual diff — used to prove a refactor changed nothing visible. |
| **Health check** | Running the ArchitectPlaybook audits against this repo to grade its architecture and agentic setup (showcase #1). |
| **Definition of Done** | The checklist in `DEFINITION_OF_DONE.md`; "done" means the gates that enforce it are green. |
| **Status level** | In the reference feature: `low` / `warning` / `critical`, derived from the count by `statusForCount`. |

This file pairs with **graphify**: the knowledge graph indexes the codebase, and
this glossary names the concepts the graph connects.
