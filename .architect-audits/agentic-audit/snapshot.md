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
| AGENTS.md | 59 | 2026-06-17 | agents-md |
| CLAUDE.md | 47 | 2026-06-17 | claude |
| .agents/README.md | 32 | 2026-06-17 | claude |
| .agents/project/ARCHITECTURE.md | 66 | 2026-06-17 | claude |
| .agents/project/CONVENTIONS.md | 64 | 2026-06-17 | claude |
| .agents/project/DEFINITION_OF_DONE.md | 43 | 2026-06-17 | claude |
| .agents/project/TECH_STACK.md | 42 | 2026-06-17 | claude |
| .agents/project/GLOSSARY.md | 21 | 2026-06-17 | claude |
| .claude/skills/run-e2e-tests/SKILL.md | 46 | 2026-06-17 | claude |
| .claude/skills/write-unit-tests/SKILL.md | 49 | 2026-06-17 | claude |

- Primary instruction file: **AGENTS.md** (59 lines; the tool-agnostic operating contract that CLAUDE.md explicitly defers to). CLAUDE.md is the Claude-specific layer.
- Agentic-instruction line total (root + `.agents/` corpus): 374 lines across 8 core files (469 including the two committed skills). CONVENTIONS.md grew from 56 to 64 lines (a branch-naming section was added).
- No `.cursor/rules/*.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, `.aider.conf.yml`, or root `CONVENTIONS.md` (Aider) detected. Single-vendor (Claude + agents.md) setup — informational only, not a gap.

## Claude Code configuration

- `.claude/` directory present: yes.
- `.claude/settings.json` present: yes; valid JSON; top-level keys `["$schema", "permissions", "hooks"]`.
  - `$schema` pinned to `https://json.schemastore.org/claude-code-settings.json`.
  - `permissions.allow`: 19 entries, all narrowly scoped (`Bash(pnpm …)`, `Bash(pnpm exec …:*)`, read-only `git`, `git add`). No `Bash(*)`/`Edit(*)`/`Write(*)` broad patterns.
  - `permissions.deny`: 4 entries — `Bash(git push:*)`, `Bash(git reset --hard:*)`, `Bash(git clean:*)`, `Bash(rm -rf:*)`.
- `.claude/settings.local.json` present: no. **Gitignored** (`.gitignore:34` excludes `.claude/settings.local.json`; confirmed by `git check-ignore`).
- Hooks: `PreToolUse` × 1 (matcher `Bash` → `.claude/hooks/block-gate-bypass.sh`, which exists and now normalises whitespace before matching `--no-verify`). `PostToolUse` 0, `Stop` 0, `Notification` 0.
- MCP servers: none (no `mcpServers` block; no `.mcp.json`).
- Status line: not set. Model override: not set. `env` block: not present.

## Committed Claude skills

| Skill | Frontmatter | Trigger |
| --- | --- | --- |
| run-e2e-tests | `name` + `description` present, valid YAML | no `trigger:` field (model-invoked) |
| write-unit-tests | `name` + `description` present, valid YAML | no `trigger:` field (model-invoked) |
