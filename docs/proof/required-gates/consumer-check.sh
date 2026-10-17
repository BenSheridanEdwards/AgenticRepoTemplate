#!/usr/bin/env bash
# Export a commit into a fresh repository, as a consumer generated from the
# template would start, and run the required-gate contract there.
# Usage: bash docs/proof/required-gates/consumer-check.sh [ref]
set -euo pipefail

ref=${1:-HEAD}
sha=$(git rev-parse "$ref")
consumer=$(mktemp -d)/consumer
mkdir -p "$consumer"
git archive "$sha" | tar -x -C "$consumer"

cd "$consumer"
unset $(git rev-parse --local-env-vars 2>/dev/null) || true
git init -q -b main
git -c user.name=Consumer -c user.email=consumer@example.com commit -q --no-gpg-sign -m init --allow-empty
git add -A
git -c user.name=Consumer -c user.email=consumer@example.com commit -q --no-gpg-sign -m "template at ${sha}"

echo "source: ${sha}"
echo "consumer: $(git rev-parse HEAD) in a fresh repository"
echo "node $(node --version), pnpm $(pnpm --version)"

echo; echo '$ pnpm install --frozen-lockfile'
pnpm install --frozen-lockfile --config.minimum-release-age=0 >/dev/null && echo ok

echo; echo '$ pnpm gates:check'
pnpm --silent gates:check

echo; echo '$ pnpm exec jest scripts/required-gates.test.ts'
pnpm exec jest scripts/required-gates.test.ts 2>&1 | grep -E '^Tests:'

lanes='up-to-date quality fallow test build e2e security'
needs() {
  local override_job=$1 override_result=$2 json='' sep=''
  for job in $lanes; do
    result=success
    [ "$job" = "$override_job" ] && result=$override_result
    [ "$result" = missing ] && continue
    json="${json}${sep}\"${job}\":{\"result\":\"${result}\",\"outputs\":{}}"
    sep=,
  done
  printf '{%s}' "$json"
}

decide() {
  local label=$1 event=$2 base=$3 job=$4 result=$5 status=0
  echo; echo "\$ --decide: ${label}"
  NEEDS=$(needs "$job" "$result") EVENT_NAME=$event BASE_REF=$base \
    node scripts/required-gates.mjs --decide >/dev/null 2>&1 || status=$?
  echo "exit ${status}"
}

decide 'all lanes success, pull_request into main' pull_request main none success
decide 'e2e missing' pull_request main e2e missing
decide 'test failure' pull_request main test failure
decide 'security cancelled' pull_request main security cancelled
decide 'quality skipped' pull_request main quality skipped
decide 'up-to-date skipped, pull_request into main' pull_request main up-to-date skipped
decide 'up-to-date skipped, push to main' push '' up-to-date skipped
