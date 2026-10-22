#!/usr/bin/env bash
set -euo pipefail

# Full fetched history, including merged branches and secrets removed at HEAD.
# checkout must use fetch-depth: 0. Any scanner error or finding fails the job.
exec gitleaks git --redact --verbose --no-banner --log-opts="--all --full-history" "$@"
