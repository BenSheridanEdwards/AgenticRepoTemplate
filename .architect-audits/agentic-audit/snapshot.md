# Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Generated: 2026-06-17T00:00:00Z
- Graphify output present: no (`noGraphify: true` — static-only run; Layer 4 layout-drift cross-referencing degraded, instruction-file checks otherwise unaffected)
- Project shape: deployable-application (React 19 runtime dependency; `vite build` emits `dist/`)
- AI surface detected: no (no `ai`, `@ai-sdk/*`, `langchain`, `@anthropic-ai/sdk`, `openai`, `cohere-ai`, `replicate` in dependencies)

## Detected agentic instruction files

| Path | Lines | Last modified | Tool family |
| --- | --- | --- | --- |
| AGENTS.md | 59 | 2026-06-17 | agents-md |
| CLAUDE.md | 47 | 2026-06-17 | claude |
| .agents/README.md | 32 | 2026-06-17 | claude |
| .agents/project/ARCHITECTURE.md | 66 | 2026-06-17 | claude |
| .agents/project/CONVENTIONS.md | 56 | 2026-06-17 | claude |
| .agents/project/DEFINITION_OF_DONE.md | 39 | 2026-06-17 | claude |
| .agents/project/TECH_STACK.md | 36 | 2026-06-17 | claude |
| .agents/project/GLOSSARY.md | 21 | 2026-06-17 | claude |
| .claude/skills/run-e2e-tests/SKILL.md | 46 | 2026-06-17 | claude |
| .claude/skills/write-unit-tests/SKILL.md | 49 | 2026-06-17 | claude |

- Primary instruction file: **AGENTS.md** (59 lines; the tool-agnostic operating contract that CLAUDE.md explicitly defers to). CLAUDE.md is the Claude-specific layer.
- Agentic-instruction line total (root + `.agents/` corpus): 356 lines across 8 core files (451 including the two committed skills).
- No `.cursor/rules/*.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, `.aider.conf.yml`, or root `CONVENTIONS.md` (Aider) detected. Single-vendor (Claude + agents.md) setup.

## Claude Code configuration

- `.claude/` directory present: yes.
- `.claude/settings.json` present: yes; valid JSON; top-level keys `["$schema", "permissions", "hooks"]`.
  - `$schema` pinned to `https://json.schemastore.org/claude-code-settings.json`.
  - `permissions.allow`: 19 entries, all narrowly scoped (`Bash(pnpm …)`, `Bash(pnpm exec …:*)`, read-only `git`). No `Bash(*)`/`Edit(*)`/`Write(*)` broad patterns.
  - `permissions.deny`: 2 entries — `Bash(git push:*)`, `Bash(rm -rf:*)`.
- `.claude/settings.local.json` present: no. **Not covered by `.gitignore`** (no `settings.local.json` or `.claude/` ignore rule; no `.claude/.gitignore`).
- Hooks: `PreToolUse` × 1 (matcher `Bash` → `.claude/hooks/block-gate-bypass.sh`, which exists). `PostToolUse` 0, `Stop` 0, `Notification` 0.
- MCP servers: none (no `mcpServers` block; no `.mcp.json`).
- Status line: not set. Model override: not set. `env` block: not present.

## Committed Claude skills

| Skill | Frontmatter | Trigger |
| --- | --- | --- |
| run-e2e-tests | `name` + `description` present, valid YAML | no `trigger:` field (model-invoked) |
| write-unit-tests | `name` + `description` present, valid YAML | no `trigger:` field (model-invoked) |
