#!/usr/bin/env sh
# Refuse to continue when a branch does not contain origin/main, so every branch
# is tested against the main it will merge into. Shared by .husky/pre-push and
# CI.
#
# Usage: sh scripts/require-up-to-date-main.sh [--pushed-refs]
#
# By default this checks HEAD. --pushed-refs reads git's pre-push lines
# ("<local ref> <local sha> <remote ref> <remote sha>") from stdin and checks
# every pushed branch instead, since a push need not come from HEAD. Deletions,
# pushes to main, and non-branch refs such as tags are exempt.
#
# A failed fetch fails closed: pre-push and CI need the network anyway.
set -u

# One "<commit> <branch name>" line per commit to check.
targets=
case "${1:-}" in
  '')
    branch="$(git symbolic-ref --short -q HEAD)"
    if [ "$branch" = main ]; then
      exit 0
    fi
    targets="HEAD ${branch:-HEAD}"
    ;;
  --pushed-refs)
    while read -r _local_ref local_sha remote_ref _remote_sha; do
      case "$local_sha" in *[!0]*) ;; *) continue ;; esac
      case "$remote_ref" in
        refs/heads/main) ;;
        refs/heads/*)
          targets="$targets
$local_sha ${remote_ref#refs/heads/}"
          ;;
      esac
    done
    ;;
  *)
    echo "usage: $0 [--pushed-refs]" >&2
    exit 2
    ;;
esac

if [ -z "$targets" ]; then
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

if ! fetch git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main; then
  echo "✗ Could not fetch origin/main, so this branch cannot be confirmed up to date." >&2
  echo "  Reconnect and retry." >&2
  exit 1
fi

stale=false
while read -r commit name; do
  if [ -n "$commit" ] && ! git merge-base --is-ancestor refs/remotes/origin/main "$commit" 2>/dev/null; then
    echo "✗ $name is behind origin/main." >&2
    stale=true
  fi
done <<TARGETS
$targets
TARGETS

if [ "$stale" = true ]; then
  echo "  Bring main into each branch above, then retry:" >&2
  echo "    git fetch origin && git merge origin/main" >&2
  exit 1
fi
