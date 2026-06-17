# Agentic audit report

Two coordinated instruction files (AGENTS.md primary, CLAUDE.md as the Claude layer) routing to a deep `.agents/` context library; `.claude/settings.json` is present, valid, narrowly scoped, with a hardened PreToolUse gate-bypass hook. This re-run grades the **current** state of the repo after the fixes that followed the first audit: the one settings-hygiene violation and the one drift partial are both resolved, and two optional hardening notes were also actioned. The result is a clean sweep — **26 present, 0 partial, 0 missing, 0 violation**. Graph-enriched run (`graphEnriched: true`).

## Snapshot

# Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `f4c862b97f79738bbe04483f2d1f2f494f77037e`
- Generated: 2026-06-17T12:00:00Z
- Graphify output present: yes (`graphEnriched: true`). `graphify-out/graph.json` exists (703 nodes, 741 edges, `built_at_commit` `4973926114fdd9e6cd31b12464a25e58fcf53ccc`). The Layer 4 layout-drift check was cross-referenced against the detected communities — `Feature-Folder Architecture`, `.agents Single Source of Truth`, and the `Agent Context Entry Points` hyperedge over AGENTS.md / CLAUDE.md / `.agents/README.md` — all of which match the layout the instruction files describe.
- Project shape: deployable-application (React 19 runtime dependency; `vite build` emits `dist/`).
- AI surface detected: no (no `ai`, `@ai-sdk/*`, `langchain`, `@anthropic-ai/sdk`, `openai`, `cohere-ai`, `replicate` in dependencies). Layer 2 tone-and-response-style check skipped silently.

## Detected agentic instruction files

| Path | Lines | Last modified | Tool family |
| --- | --- | --- | --- |
| AGENTS.md (primary) | 59 | 2026-06-17 | agents-md |
| CLAUDE.md | 47 | 2026-06-17 | claude |
| .agents/README.md | 32 | 2026-06-17 | claude |
| .agents/project/ARCHITECTURE.md | 66 | 2026-06-17 | claude |
| .agents/project/CONVENTIONS.md | 64 | 2026-06-17 | claude |
| .agents/project/DEFINITION_OF_DONE.md | 43 | 2026-06-17 | claude |
| .agents/project/TECH_STACK.md | 42 | 2026-06-17 | claude |
| .agents/project/GLOSSARY.md | 21 | 2026-06-17 | claude |
| .claude/skills/run-e2e-tests/SKILL.md | 46 | 2026-06-17 | claude |
| .claude/skills/write-unit-tests/SKILL.md | 49 | 2026-06-17 | claude |

- Agentic-instruction line total (root + `.agents/` core): 374 (469 including the two committed skills). CONVENTIONS.md grew from 56 to 64 lines (a branch-naming section was added).
- No `.cursor/rules/*.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, or `.aider.conf.yml`. Single-vendor (Claude + agents.md) — informational only, not a gap.
- `.claude/settings.json`: valid JSON, keys `$schema`/`permissions`/`hooks`; allow=19 (all scoped), deny=4 (`Bash(git push:*)`, `Bash(git reset --hard:*)`, `Bash(git clean:*)`, `Bash(rm -rf:*)`); one PreToolUse(Bash) hook -> `.claude/hooks/block-gate-bypass.sh` (exists, whitespace-normalising). No env / mcpServers / statusLine / model.
- `.claude/settings.local.json`: not present on disk; **gitignored** (`.gitignore:34`, confirmed by `git check-ignore`).

## Status tally

| Layer | present | partial | missing | violation |
| --- | --- | --- | --- | --- |
| 1 — Project context coverage | 7 | 0 | 0 | 0 |
| 2 — Operational guidance & conventions | 5 | 0 | 0 | 0 |
| 3 — Claude Code settings hygiene | 7 | 0 | 0 | 0 |
| 4 — Multi-agent consistency & drift | 7 | 0 | 0 | 0 |
| **Total** | **26** | **0** | **0** | **0** |

## What changed since the prior run

| Item | Prior status | Now | Evidence |
| --- | --- | --- | --- |
| `.claude/settings.local.json` gitignored | **violation** | **present** | `.gitignore:34` `.claude/settings.local.json`; `git check-ignore -v` matches |
| No-abbreviations policy self-compliance | **partial** | **present** | `CONVENTIONS.md:14-16` scoped to identifiers + acronym allowlist (E2E, CI, ADR, UI, IO, URL) |
| Destructive-command deny list | present (minimal) | present (broadened) | `settings.json:25` adds `git reset --hard` and `git clean` |
| Gate-bypass hook robustness | present (literal match) | present (hardened) | `block-gate-bypass.sh:10` normalises whitespace before matching |
| Branch-naming convention | absent (completeness note) | present | `CONVENTIONS.md:59-64` `<type>/<short-kebab-summary>` |
| Graphify cross-reference | unavailable (`noGraphify: true`) | available (`graphEnriched: true`) | `graphify-out/graph.json` present |

Net: the only **violation** and the only **partial** from the first audit are both resolved, and every optional hardening note has been actioned. No new gaps were introduced by the added files (SECURITY.md, `.fallowrc.jsonc`, the codeql/lighthouse/styleproof workflows) — AGENTS.md / CLAUDE.md / `.agents/` still cohere and all cross-references resolve.

## Top 5 highest-leverage recommendations

This repo now passes all 26 graded checks. There is no open violation or partial. The items below are honest, low-priority follow-ups; none is a baseline failure.

1. **Hold the line on settings hygiene (no action — verification note)**
   - Why it matters: the prior sole violation (`.claude/settings.local.json` not gitignored) is fixed and confirmed by `git check-ignore`. Because this is a template, the fix propagates the safe default to every downstream consumer.
   - Real consequences if ignored: none currently — this is a "keep it this way" note. The ignore line lives in the `Claude Code personal overrides` block at `.gitignore:34`; do not let a future refactor of `.gitignore` drop it.
   - Smallest high-leverage fix: none required. Optionally add a one-line test/CI assertion that `git check-ignore .claude/settings.local.json` succeeds, so a regression is caught automatically.

2. **(Informational) No Cursor / Windsurf / Copilot / Aider rule files**
   - Why it matters: the repo is single-vendor (Claude + agents.md). That is a deliberate, coherent choice, not a gap — the baseline grades whatever is present and does not penalise a missing vendor.
   - Real consequences if ignored: none. Only relevant if the team later onboards Cursor or Windsurf users, at which point a thin pointer file (`see AGENTS.md`) would preserve the single-source-of-truth model.
   - Smallest high-leverage fix: if/when a second tool is adopted, add a one-line `.cursorrules` (or `.cursor/rules/*.mdc`) that references AGENTS.md rather than duplicating rules.

3. **Optionally assert the gate-bypass hook in CI (defence in depth, not a gap)**
   - Why it matters: `block-gate-bypass.sh` now normalises whitespace before matching `--no-verify` (line 10), closing the obfuscated-spacing bypass. It is still a guard-rail, not a hard security boundary (a sufficiently creative agent could still construct an evasion).
   - Real consequences if ignored: low — the hook covers the honest and lightly-obfuscated cases, which is its job.
   - Smallest high-leverage fix: a tiny shell test feeding crafted inputs to the hook and asserting exit code 2, run in CI, would lock the behaviour against future edits.

4. **Optionally extend the deny list to history-rewrite verbs (hardening)**
   - Why it matters: `permissions.deny` now blocks push, `git reset --hard`, `git clean`, and `rm -rf` — comfortably above the baseline. The remaining irreversible operations not named are history rewrites (`git filter-branch`, `git push --force-with-lease`, `git rebase` onto a shared base).
   - Real consequences if ignored: minimal — `git push:*` already blocks the most dangerous outbound case.
   - Smallest high-leverage fix: add `Bash(git filter-branch:*)` and `Bash(git rebase:*)` to `permissions.deny` if the team wants belt-and-braces.

5. **Keep the `.agents/` corpus inside the bloat budget (maintenance note)**
   - Why it matters: the root files are model-thin (59 + 47 lines) and delegate to `.agents/`, which keeps the agent's context lean. As `.agents/` grows (CONVENTIONS.md already grew this cycle), keep each file focused so the routing-table model stays the load-bearing pattern.
   - Real consequences if ignored: none today; a slow drift toward an over-long single file would only matter if a future reader inlines `.agents/` content back into AGENTS.md or CLAUDE.md.
   - Smallest high-leverage fix: none now — just keep new detail in the appropriate `.agents/project/*` file rather than the root entry points.

Bottom line: by agentic-instruction standards this template is now exemplary — every one of the 26 graded checks passes cleanly, with both prior findings resolved and all optional hardening actioned.

## Checks

### Layer 1 — Project context coverage

#### project-context-coverage.primary-instruction-file-present — present
- Expectation: at least one root agentic instruction file exists.
- Evidence: `AGENTS.md`, `CLAUDE.md`.
- Gap: None. Deliberate primary (AGENTS.md) / Claude-layer (CLAUDE.md) split.
- Remediation: No action.

#### project-context-coverage.primary-instruction-file-substantive — present
- Expectation: primary file >= 25 lines with real structure.
- Evidence: `AGENTS.md` (59 lines, five headed sections + routing table).
- Gap: None.
- Remediation: No action.

#### project-context-coverage.primary-instruction-file-not-bloated — present
- Expectation: primary file <= 400 lines.
- Evidence: `AGENTS.md` 59, `CLAUDE.md` 47; detail delegated to `.agents/`.
- Gap: None — thin-entrypoint pattern is a model design, not a shortfall.
- Remediation: No action.

#### project-context-coverage.project-purpose-documented — present
- Expectation: states what the project is and who it is for.
- Evidence: `AGENTS.md:9-12`, `CLAUDE.md:7-16`, `package.json:description`.
- Gap: None.
- Remediation: No action.

#### project-context-coverage.tech-stack-documented — present
- Expectation: names framework, language, runtime.
- Evidence: `.agents/project/TECH_STACK.md` (one-owner-per-concern table), Node >=20 in `AGENTS.md` + `package.json` engines.
- Gap: None.
- Remediation: No action.

#### project-context-coverage.architectural-mental-model-documented — present
- Expectation: directory layout / module pattern / link to ARCHITECTURE.md.
- Evidence: `.agents/project/ARCHITECTURE.md` (feature-folder slices, view/hook/pure-logic split, index.ts surface), routed from both root files. Graph confirms via `Feature-Folder Architecture` god node and `.agents Single Source of Truth`.
- Gap: None.
- Remediation: No action.

#### project-context-coverage.domain-glossary-and-canonical-doc-links — present
- Expectation: glossary where domain terms exist; canonical docs linked.
- Evidence: `.agents/project/GLOSSARY.md`; README/ARCHITECTURE/ADR/template links across `AGENTS.md`, `CLAUDE.md`, `.agents/README.md`, `README.md`.
- Gap: None. No CONTRIBUTING.md exists, so it is not expected in links.
- Remediation: No action.

### Layer 2 — Operational guidance and conventions

#### operational-guidance.build-test-run-commands-documented — present
- Expectation: install, dev, test, build commands documented.
- Evidence: `AGENTS.md:15-22` "Run it"; reinforced in DEFINITION_OF_DONE.md and both skills. All resolve to real scripts (Layer 4).
- Gap: None.
- Remediation: No action.

#### operational-guidance.code-style-and-naming-conventions-documented — present
- Expectation: naming, imports, formatting, abbreviations policy.
- Evidence: `.agents/project/CONVENTIONS.md` (mechanical naming rules, identifier-scoped no-abbreviations rule with acronym allowlist, import-type rule, Biome-owned ordering).
- Gap: None.
- Remediation: No action.

#### operational-guidance.commit-and-branching-conventions-documented — present
- Expectation: commit-message convention, branch-naming convention, git add policy.
- Evidence: `CONVENTIONS.md:52-64`, `AGENTS.md:35`, `commitlint.config.ts`, `.husky/commit-msg`. Branch naming now documented (`<type>/<short-kebab-summary>`, CONVENTIONS.md:59-64).
- Gap: None — the prior completeness note (branch naming unstated) is closed.
- Remediation: No action.

#### operational-guidance.testing-philosophy-documented — present
- Expectation: framework, query priority, behaviour-over-implementation.
- Evidence: both `.claude/skills/*/SKILL.md`, `ARCHITECTURE.md:45-50`, ADR 0003.
- Gap: None.
- Remediation: No action.

#### operational-guidance.do-and-do-not-guidance-present — present
- Expectation: both positive and negative agent guidance.
- Evidence: `AGENTS.md` golden rules + Safety; `.agents/README.md` contract; `TECH_STACK.md` boundaries.
- Gap: None.
- Remediation: No action.

### Layer 3 — Claude Code settings hygiene

#### settings-hygiene.settings-json-valid-json — present
- Expectation: parses as JSON.
- Evidence: `.claude/settings.json` parses; pins `$schema`.
- Gap: None.
- Remediation: No action.

#### settings-hygiene.settings-local-json-gitignored — present (was violation)
- Expectation: `.gitignore` excludes `settings.local.json`.
- Evidence: `.gitignore:34` `.claude/settings.local.json` (under the "Claude Code personal overrides" comment); `git check-ignore -v` confirms the match.
- Gap: None — RESOLVED. This was the sole violation in the prior audit.
- Remediation: No action.

#### settings-hygiene.no-secrets-in-settings-json — present
- Expectation: no secret-shaped values or secret-named keys.
- Evidence: only permission patterns + a hook command; no env block.
- Gap: None.
- Remediation: No action.

#### settings-hygiene.permissions-appropriately-scoped — present
- Expectation: no over-broad allow patterns beyond threshold 5.
- Evidence: 19 scoped entries (named pnpm scripts, scoped `pnpm exec`, read-only git + `git add`); zero broad patterns.
- Gap: None.
- Remediation: No action.

#### settings-hygiene.permissions-deny-non-empty-in-deployed-project — present
- Expectation: deployable project names destructive commands in deny.
- Evidence: `Bash(git push:*)`, `Bash(git reset --hard:*)`, `Bash(git clean:*)`, `Bash(rm -rf:*)`.
- Gap: None — the deny list now covers four destructive verbs. The prior "minimal coverage" hardening note is closed (`git reset --hard` and `git clean` added).
- Remediation: No action.

#### settings-hygiene.hooks-reference-scripts-that-exist — present
- Expectation: hook commands invoke scripts that exist.
- Evidence: PreToolUse(Bash) -> `.claude/hooks/block-gate-bypass.sh` exists, executable; blocks `--no-verify` with exit 2. Now normalises whitespace before matching (line 10: tr newline/tab to spaces, squeeze).
- Gap: None — the prior "literal substring match could be evaded by obfuscation" note is hardened. It remains a guard-rail, not a hard security boundary.
- Remediation: No action.

#### settings-hygiene.env-and-mcp-and-overrides-clean — present
- Expectation: no secret env values; auditable MCP entries; intentional overrides.
- Evidence: no env / mcpServers / `.mcp.json` / statusLine / model.
- Gap: None / not-applicable.
- Remediation: No action.

### Layer 4 — Multi-agent consistency and drift

#### drift.single-source-of-truth-for-shared-rules — present
- Expectation: one source of truth, others reference it.
- Evidence: `CLAUDE.md:3` ("Read AGENTS.md first"), `AGENTS.md:6`, `.agents/README.md:6-11`. Graph `Agent Context Entry Points` hyperedge corroborates.
- Gap: None — no conflicting guidance.
- Remediation: No action.

#### drift.tech-stack-mentions-match-dependencies — present
- Expectation: named frameworks exist in `package.json`; no stale mentions.
- Evidence: React 19, Vite, Jest, RTL, Playwright, Biome, commitlint, husky, Fallow, StyleProof all present; no removed-tool mentions.
- Gap: None.
- Remediation: No action.

#### drift.commands-match-package-json-scripts — present
- Expectation: documented script commands exist in `package.json`.
- Evidence: dev/build/typecheck/check/lint/format/fallow:audit/test/test:watch/test:coverage/e2e/e2e:install/verify/setup:agents all resolve.
- Gap: None.
- Remediation: No action.

#### drift.cross-references-resolve — present
- Expectation: internal references point at existing paths.
- Evidence: all `.agents/project/*`, `.agents/decisions/` (four ADRs), four templates, e2e specs, `src/features/threshold-counter`, README, config files resolve. New files (SECURITY.md, `.fallowrc.jsonc`, codeql/lighthouse/styleproof workflows) introduced no dangling references in the instruction corpus.
- Gap: None.
- Remediation: No action.

#### drift.no-retired-model-identifiers — present
- Expectation: no retired model IDs in active guidance.
- Evidence: no model identifiers anywhere in the corpus.
- Gap: None.
- Remediation: No action.

#### drift.instruction-file-freshness — present
- Expectation: active project has a recently modified instruction file.
- Evidence: latest commit 2026-06-17; every instruction file modified 2026-06-17.
- Gap: None.
- Remediation: No action.

#### drift.no-abbreviations-policy-self-compliance — present (was partial)
- Expectation: a declared no-abbreviations policy is honoured in prose.
- Evidence: `CONVENTIONS.md:14-16` now scopes the rule to identifiers ("No abbreviations in identifiers") and adds an accepted-acronym allowlist (E2E, CI, ADR, UI, IO, URL — "fine in prose, comments, and headings").
- Gap: None — RESOLVED. The prose's acronym use is now sanctioned by the policy itself; no self-compliance drift remains. This was the sole partial in the prior audit.
- Remediation: No action.

## Notes

- `graphEnriched: true`: `graphify-out/graph.json` is present (703 nodes, 741 edges, `built_at_commit` `4973926114fdd9e6cd31b12464a25e58fcf53ccc`), so the Layer 4 layout-drift cross-reference ran against the detected communities. The instruction files' layout claims (feature-folders under `src/features`, `.agents/` as the single source of truth, AGENTS.md/CLAUDE.md as the entry points) all match graph nodes and hyperedges. Directory-layout claims were additionally verified directly against the filesystem.
- This was a read-only static audit. No project files were modified; only this `.architect-audits/agentic-audit/` directory was written.
