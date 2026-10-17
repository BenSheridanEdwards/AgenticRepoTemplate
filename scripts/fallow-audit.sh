#!/usr/bin/env bash
set -euo pipefail

# Fallow's `audit` reports only the issues a change INTRODUCES versus a base
# branch (dead code, cycles, complexity, architecture drift). That "introduced
# only" framing is what makes it safe to drop onto a brownfield repo without
# drowning in pre-existing findings.
#
# `audit` needs a base ref to diff against. In normal use that is `origin/main`,
# which the up-to-date check keeps fresh and CI compares against, or local `main`
# in a clone with no remote. A stale local `main` would count main's own new code
# as introduced by the branch. On a brand-new repo, before the first commit, no base exists yet — so
# we skip rather than fail. The moment a base branch exists, the gate is live.
#
# Override the base with FALLOW_BASE=<ref>.

base="${FALLOW_BASE:-}"

if [ -z "${base}" ]; then
  if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
    base="origin/main"
  elif git rev-parse --verify --quiet refs/heads/main >/dev/null; then
    base="main"
  fi
fi

if [ -n "${base}" ]; then
  exec pnpm exec fallow audit --base "${base}"
fi

echo "fallow: no base branch yet — skipping introduced-issue audit (first commit?)."
