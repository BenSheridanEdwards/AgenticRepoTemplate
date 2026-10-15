#!/usr/bin/env sh
# Refuse to continue when HEAD does not contain origin/main, so every branch is
# tested against the main it will merge into. Shared by .husky/pre-commit,
# .husky/pre-push, and CI.
#
# Usage: sh scripts/require-up-to-date-main.sh [--allow-offline]
#
# By default a failed fetch fails closed (pre-push and CI need the network
# anyway). --allow-offline warns and checks the last known origin/main instead,
# so commits stay fast and work offline.
set -u

allow_offline=false
case "${1:-}" in
  --allow-offline) allow_offline=true ;;
  '') ;;
  *)
    echo "usage: $0 [--allow-offline]" >&2
    exit 2
    ;;
esac

if [ "$(git symbolic-ref --short -q HEAD)" = main ]; then
  exit 0
fi

# macOS ships no `timeout`, so a watchdog bounds the fetch on every platform.
fetch() {
  GIT_TERMINAL_PROMPT=0 "$@" </dev/null >/dev/null 2>&1 &
  pid=$!
  (sleep "${UP_TO_DATE_FETCH_TIMEOUT:-10}" && kill "$pid") >/dev/null 2>&1 &
  watchdog=$!
  wait "$pid"
  status=$?
  kill "$watchdog" 2>/dev/null
  return "$status"
}

# Concluding a conflicted `git merge origin/main` commits with origin/main only
# in MERGE_HEAD, so that counts as containing it.
contains_origin_main() {
  git merge-base --is-ancestor refs/remotes/origin/main HEAD 2>/dev/null ||
    { git rev-parse -q --verify MERGE_HEAD >/dev/null &&
      git merge-base --is-ancestor refs/remotes/origin/main MERGE_HEAD 2>/dev/null; }
}

if ! fetch git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main; then
  if [ "$allow_offline" = false ]; then
    echo "✗ Could not fetch origin/main, so this branch cannot be confirmed up to date." >&2
    echo "  Reconnect and retry." >&2
    exit 1
  fi
  echo "⚠ Could not fetch origin/main; checking against the last known origin/main." >&2
  if ! git rev-parse --verify -q refs/remotes/origin/main >/dev/null; then
    exit 0
  fi
fi

if ! contains_origin_main; then
  echo "✗ This branch is behind origin/main. Bring main in, then retry:" >&2
  echo "    git fetch origin && git merge origin/main" >&2
  exit 1
fi
