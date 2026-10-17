#!/usr/bin/env bash
# Plant each fault from issue #47, show the contract tests and `pnpm gates:check`
# go red, restore, and show them green again. Run from the repository root.
set -uo pipefail

CONTRACT=scripts/required-gates.mjs
WORKFLOW=.github/workflows/ci.yml
backup=$(mktemp -d)
cp "$CONTRACT" "$WORKFLOW" "$backup/"
restore() { cp "$backup/required-gates.mjs" "$CONTRACT"; cp "$backup/ci.yml" "$WORKFLOW"; }
trap restore EXIT

gates() {
  pnpm exec jest scripts/required-gates.test.ts 2>&1 | grep -E '✕|^Tests:'
  node "$CONTRACT" --check 2>&1 | head -n 3
}

plant() {
  local label=$1 file=$2 from=$3 to=$4
  printf '\n## Fault: %s\n' "$label"
  FROM=$from TO=$to node -e '
    const fs = require("node:fs");
    const [file] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(process.env.FROM)) { console.error("anchor not found"); process.exit(2); }
    fs.writeFileSync(file, text.replace(process.env.FROM, process.env.TO));
  ' "$file" || exit 2
  git diff --stat -- "$file" | tail -n 1
  gates
  restore
  printf -- '-- restored --\n'
  gates
}

plant 'omit a required lane from the contract' "$CONTRACT" \
  "  {
    check: 'End-to-end behaviour map',
    workflow: 'ci.yml',
    job: 'e2e',
    judgedBy: 'aggregate',
    local: '\`pnpm e2e\`, pre-push hook',
  },
" ''

plant 'omit a required lane from the aggregate needs' "$WORKFLOW" \
  'needs: [up-to-date, quality, fallow, test, build, e2e, security]' \
  'needs: [up-to-date, quality, fallow, test, build, security]'

plant 'treat cancellation as success' "$CONTRACT" \
  "if (result === 'success') {" \
  "if (result === 'success' || result === 'cancelled') {"
