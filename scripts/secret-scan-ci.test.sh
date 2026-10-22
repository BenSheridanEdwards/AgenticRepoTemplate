#!/usr/bin/env bash
set -euo pipefail

# Exercise the same scanner entry point as CI with disposable Git history.
scan="$(cd "$(dirname "$0")" && pwd)/secret-scan-ci.sh"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT

git init -q "$fixture"
git -C "$fixture" config user.name 'Scanner test'
git -C "$fixture" config user.email 'scanner-test@example.invalid'
printf 'clean source\n' > "$fixture/source.txt"
git -C "$fixture" add source.txt
git -C "$fixture" commit -qm 'clean source'
bash "$scan" "$fixture" > "$fixture/scan.log" 2>&1
printf 'PASS: clean history accepted\n'

# Assemble an inert token only inside the disposable fixture, never in source.
printf 'token = "ghp_%s"\n' 'aB3dE6gH9jK2mN5pQ8sT1vW4xY7zA0bC3dE6' > "$fixture/source.txt"
git -C "$fixture" add source.txt
git -C "$fixture" commit -qm 'synthetic secret'
printf 'clean source again\n' > "$fixture/source.txt"
git -C "$fixture" add source.txt
git -C "$fixture" commit -qm 'remove synthetic secret'

if bash "$scan" "$fixture" > "$fixture/scan.log" 2>&1; then
  printf 'FAIL: secret removed from the working tree escaped history scanning\n' >&2
  exit 1
else
  status=$?
  test "$status" -eq 1
  # A scanner crash is not proof of detection. Require its redacted rule output.
  grep -q 'leaks found: 1' "$fixture/scan.log"
  grep -q 'github-pat' "$fixture/scan.log"
  if grep -q 'ghp_' "$fixture/scan.log"; then
    printf 'FAIL: synthetic token was not redacted\n' >&2
    exit 1
  fi
fi
printf 'PASS: synthetic secret detected in earlier history (exit 1)\n'
