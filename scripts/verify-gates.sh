#!/usr/bin/env bash
set -euo pipefail

# The local mirror of the CI gate suite. Run this before opening a PR; if it is
# green, CI will be too (CI re-runs the same checks on a clean checkout, plus
# the security audit and StyleProof, which need the GitHub environment).

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Context layer invariants (files, manifest, docs, skills)"
pnpm check:context

step "Type check (tsc --noEmit)"
pnpm typecheck

step "Lint + format + imports (Biome)"
pnpm check

step "Code intelligence (Fallow)"
pnpm fallow:audit

step "Unit + component tests with coverage (Jest + RTL)"
pnpm test:coverage

step "Production build (Vite)"
pnpm build

step "Bundle-size budget (size-limit)"
pnpm size

step "End-to-end behaviour map + accessibility scan (Playwright + axe)"
pnpm e2e

printf '\n\033[32m✓ All local gates passed.\033[0m\n'
