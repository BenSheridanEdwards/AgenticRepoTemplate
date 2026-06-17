#!/usr/bin/env bash
set -euo pipefail

# Installs the EXTERNAL agentic tooling this template references but does not
# vendor (see .agents/decisions/0004-agent-context-lives-in-dot-agents.md):
#
#   • Fallow            — code intelligence (CLI is a devDependency already)
#   • Fallow skills     — teaches agents how to read Fallow's output
#   • ArchitectPlaybook — the repo health-check audits (showcase #1)
#   • graphify          — knowledge graph that ArchitectPlaybook's setup expects
#
# Safe to re-run. Steps that need Claude Code's interactive `/install` are
# printed as the next action rather than executed.

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
note() { printf '  \033[33m→\033[0m %s\n' "$1"; }

bold "1/4  Fallow (code intelligence)"
if pnpm exec fallow --version >/dev/null 2>&1; then
  ok "fallow CLI available via pnpm exec fallow"
else
  note "fallow not found — run 'pnpm install' first (it is a devDependency)"
fi

bold "2/4  Fallow agent skill"
if command -v npx >/dev/null 2>&1; then
  npx --yes skills add fallow-rs/fallow-skills || \
    note "could not auto-install; in Claude Code run: /install fallow-rs/fallow-skills"
else
  note "in Claude Code run: /install fallow-rs/fallow-skills"
fi

bold "3/4  ArchitectPlaybook (repo health-check audits)"
PLAYBOOK_DIR="${HOME}/architect-playbook"
if [ -d "${PLAYBOOK_DIR}/.git" ]; then
  ok "already cloned at ${PLAYBOOK_DIR}"
else
  git clone https://github.com/BenSheridanEdwards/ArchitectPlaybook.git "${PLAYBOOK_DIR}" || \
    note "clone failed — clone https://github.com/BenSheridanEdwards/ArchitectPlaybook manually"
fi
note "open ${PLAYBOOK_DIR} in Claude Code and run: /install-architect-playbook-globally"
note "then, from THIS repo: /pre-audit-setup and the audits (see README)"

bold "4/4  graphify (knowledge graph)"
if [ -d "${HOME}/.claude/skills/graphify" ]; then
  ok "graphify present at ~/.claude/skills/graphify"
else
  note "graphify not found — see https://graphify.net (ArchitectPlaybook's /pre-audit-setup expects it)"
fi

echo
bold "Done. Run the health-check from Claude Code:"
echo "  /pre-audit-setup"
echo "  /agentic-audit   /quality-gates-audit   /architecture-audit   /testing-audit   /security-audit"
