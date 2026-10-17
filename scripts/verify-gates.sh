#!/usr/bin/env bash
set -euo pipefail

# The local mirror of the CI gate suite. Run this before opening a PR. Local
# green is not hosted readiness: the security audit, CodeQL, Lighthouse, and the
# PR body check run only on GitHub, and the `Required gates` check decides.
# docs/required-gates.md lists every required check and its local mirror.

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Context layer invariants (files, manifest, docs, skills)"
pnpm check:context

step "Every suppression names a rule and a reason"
pnpm check:suppressions

step "Required-gate contract matches the workflows and inventory"
pnpm gates:check

step "Type check (tsc --noEmit)"
pnpm typecheck

step "Lint + format + imports (Biome)"
pnpm check

step "Policy, React hooks, and React Compiler lint (ESLint)"
pnpm lint:policy

step "React Doctor project checks"
pnpm react-doctor

step "Code intelligence (Fallow)"
pnpm fallow:audit

step "Architecture gate, role diagram, and API reports (Fallow + API Extractor)"
pnpm arch:check

step "Unit + component tests with coverage (Jest + RTL)"
pnpm test:coverage

step "Production build (Vite)"
pnpm build

step "Bundle-size budget (size-limit)"
pnpm size

step "End-to-end behaviour map + accessibility scan (Playwright + axe)"
pnpm e2e

printf '\n\033[32m✓ All local gates passed.\033[0m\n'
printf 'Hosted-only checks still decide readiness: see docs/required-gates.md.\n'
