# Agentic audit report

Two coordinated instruction files (AGENTS.md primary, CLAUDE.md as the Claude layer) routing to a deep `.agents/` context library; `.claude/settings.json` is present, valid, narrowly scoped, with a working PreToolUse gate-bypass hook. One real settings-hygiene gap and one soft drift finding. Static-only run (`noGraphify: true`).

## Snapshot

# Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Generated: 2026-06-17T00:00:00Z
- Graphify output present: no (`noGraphify: true` — static-only; Layer 4 layout-drift cross-referencing degraded, instruction-file checks otherwise unaffected)
- Project shape: deployable-application (React 19 runtime dependency; `vite build` emits `dist/`)
- AI surface detected: no

## Detected agentic instruction files

| Path | Lines | Last modified | Tool family |
| --- | --- | --- | --- |
| AGENTS.md (primary) | 59 | 2026-06-17 | agents-md |
| CLAUDE.md | 47 | 2026-06-17 | claude |
| .agents/README.md | 32 | 2026-06-17 | claude |
| .agents/project/ARCHITECTURE.md | 66 | 2026-06-17 | claude |
| .agents/project/CONVENTIONS.md | 56 | 2026-06-17 | claude |
| .agents/project/DEFINITION_OF_DONE.md | 39 | 2026-06-17 | claude |
| .agents/project/TECH_STACK.md | 36 | 2026-06-17 | claude |
| .agents/project/GLOSSARY.md | 21 | 2026-06-17 | claude |
| .claude/skills/run-e2e-tests/SKILL.md | 46 | 2026-06-17 | claude |
| .claude/skills/write-unit-tests/SKILL.md | 49 | 2026-06-17 | claude |

- Agentic-instruction line total (root + `.agents/` core): 356.
- No `.cursor/rules/*.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, or `.aider.conf.yml`. Single-vendor (Claude + agents.md).
- `.claude/settings.json`: valid JSON, keys `$schema`/`permissions`/`hooks`; allow=19 (all scoped), deny=2 (`Bash(git push:*)`, `Bash(rm -rf:*)`); one PreToolUse(Bash) hook -> `.claude/hooks/block-gate-bypass.sh` (exists). No env / mcpServers / statusLine / model.
- `.claude/settings.local.json`: not present; **not gitignored**.

## Status tally

| Layer | present | partial | missing | violation |
| --- | --- | --- | --- | --- |
| 1 — Project context coverage | 7 | 0 | 0 | 0 |
| 2 — Operational guidance & conventions | 6 | 0 | 0 | 0 |
| 3 — Claude Code settings hygiene | 6 | 0 | 0 | 1 |
| 4 — Multi-agent consistency & drift | 6 | 1 | 0 | 0 |
| **Total** | **25** | **1** | **0** | **1** |

## Top 5 highest-leverage recommendations

1. **Gitignore `.claude/settings.local.json` (settings hygiene — the only violation)**
   - Why it matters: `settings.local.json` is the personal-override file; the committed `settings.json` is the shared baseline. Nothing excludes the local file today.
   - Real consequences if ignored: the first contributor who adds a local model pin, an extra allow pattern, or an env value can commit it silently — and because this is a *template*, every downstream repo inherits the leak path.
   - Smallest high-leverage fix: add one line `.claude/settings.local.json` to the existing "Local env + editor noise" block in `.gitignore`. ~2 minutes, zero blast radius.

2. **Scope or allowlist the "no abbreviations" rule (drift — the only partial)**
   - Why it matters: CONVENTIONS.md prints a blanket "No abbreviations" banner, yet the instruction prose uses E2E, CI, ADR, UI, IO. The rule clearly means *identifiers* ("count not cnt"), but a strict agent reading the banner literally gets mixed signals.
   - Real consequences if ignored: an over-literal agent either flags the docs' own acronyms or expands them inconsistently across code and prose.
   - Smallest high-leverage fix: reword to "No abbreviations in names" or add a one-line accepted-acronym allowlist (E2E, CI, CD, ADR, UI, IO, API) in CONVENTIONS.md.

3. **Optionally widen the destructive-command deny list (hardening, not a gap)**
   - Why it matters: `deny` correctly blocks force/any push and `rm -rf`, which satisfies the baseline, but other irreversible commands (`git reset --hard`, `git clean -fd`, history rewrites) are still allowed implicitly.
   - Real consequences if ignored: an agent recovering from a bad state could discard uncommitted work with a single allowed command.
   - Smallest high-leverage fix: add `Bash(git reset --hard:*)` and `Bash(git clean:*)` to `permissions.deny`.

4. **Harden the gate-bypass hook against obfuscated `--no-verify` (defence in depth)**
   - Why it matters: `block-gate-bypass.sh` does a literal substring match on the raw input. It catches the honest case but not deliberately spaced/quoted variants.
   - Real consequences if ignored: the guard reads as a hard boundary in the docs ("a hook enforces this") while being bypassable by an adversarial caller — a confidence gap, low real risk.
   - Smallest high-leverage fix: normalise whitespace before matching, and also gate on the resolved `git config` no-verify path; keep exit code 2.

5. **Add a one-line branch-naming convention (completeness)**
   - Why it matters: commit format is documented and enforced, but branch naming is unstated; agents otherwise invent their own.
   - Real consequences if ignored: inconsistent branch names across agent-driven PRs; minor, cosmetic.
   - Smallest high-leverage fix: one line in CONVENTIONS.md under "Commits" (e.g. `type/scope-short-description`).

Bottom line: this template is, by agentic-instruction standards, near-exemplary — 25 of 27 checks pass cleanly. The single violation (#1) is a real but trivial one-line fix.

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
- Evidence: `.agents/project/ARCHITECTURE.md` (feature-folder slices, view/hook/pure-logic split, index.ts surface), routed from both root files.
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
- Evidence: `.agents/project/CONVENTIONS.md` (mechanical naming rules, import-type rule, Biome-owned ordering).
- Gap: None.
- Remediation: No action.

#### operational-guidance.commit-and-branching-conventions-documented — present
- Expectation: commit-message convention, git add policy.
- Evidence: `CONVENTIONS.md:52-56`, `AGENTS.md:35`, `commitlint.config.ts`, `.husky/commit-msg`.
- Gap: Branch naming unstated (commit format fully enforced).
- Remediation: Optional — add a branch-naming line.

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

#### settings-hygiene.settings-local-json-gitignored — violation
- Expectation: `.gitignore` excludes `settings.local.json`.
- Evidence: `.gitignore` has no `settings.local.json` / `.claude/` rule; no `.claude/.gitignore`.
- Gap: Personal overrides become committable; amplified because consumers inherit the template's `.gitignore`.
- Remediation: Add `.claude/settings.local.json` to the root `.gitignore` "Local env + editor noise" block.

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
- Evidence: `Bash(git push:*)`, `Bash(rm -rf:*)`.
- Gap: None for baseline; coverage is minimal (no `git reset --hard`, `git clean`).
- Remediation: Optional hardening — extend the deny list.

#### settings-hygiene.hooks-reference-scripts-that-exist — present
- Expectation: hook commands invoke scripts that exist.
- Evidence: PreToolUse(Bash) -> `.claude/hooks/block-gate-bypass.sh` exists; blocks `--no-verify` with exit 2.
- Gap: None. Literal substring match could be evaded by obfuscation (guard-rail, not a security boundary).
- Remediation: Optional — normalise input before matching.

#### settings-hygiene.env-and-mcp-and-overrides-clean — present
- Expectation: no secret env values; auditable MCP entries; intentional overrides.
- Evidence: no env / mcpServers / `.mcp.json` / statusLine / model.
- Gap: None / not-applicable.
- Remediation: No action.

### Layer 4 — Multi-agent consistency and drift

#### drift.single-source-of-truth-for-shared-rules — present
- Expectation: one source of truth, others reference it.
- Evidence: `CLAUDE.md:3` ("Read AGENTS.md first"), `AGENTS.md:6`, `.agents/README.md:6-11`.
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
- Evidence: all `.agents/project/*`, `.agents/decisions/`, four templates, e2e specs, `src/features/threshold-counter`, README, config files, ADRs 0003/0004 resolve.
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

#### drift.no-abbreviations-policy-self-compliance — partial
- Expectation: a declared no-abbreviations policy is honoured in prose.
- Evidence: `CONVENTIONS.md:14-16` declares the rule (by its examples, identifier-scoped); prose uses E2E, CI, ADR, UI, IO.
- Gap: Established domain acronyms, not lazy identifier abbreviations — soft partial, not a violation.
- Remediation: Scope the rule to identifiers or add a short accepted-acronym allowlist.

## Notes

- `noGraphify: true`: `graphify-out/graph.json` is absent, so the Layer 4 layout-drift cross-reference against detected communities was not available. Directory-layout claims in `ARCHITECTURE.md` were instead verified directly against the filesystem (`src/features/threshold-counter` and the four templates all exist). Confidence on layout-drift is therefore based on static path checks rather than graph communities.
- This was a read-only static audit. No project files were modified; only this `.architect-audits/agentic-audit/` directory was written.
