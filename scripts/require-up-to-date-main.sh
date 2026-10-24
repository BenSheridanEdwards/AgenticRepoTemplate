#!/usr/bin/env sh
# Refuse to continue when a branch does not contain origin/main, so every branch
# is tested against the main it will merge into. Shared by .husky/pre-push and
# CI.
#
# Usage: sh scripts/require-up-to-date-main.sh [--allow-offline | --pushed-refs]
#
# By default this checks HEAD. --pushed-refs reads git's pre-push lines
# ("<local ref> <local sha> <remote ref> <remote sha>") from stdin and checks
# every pushed branch instead, since a push need not come from HEAD. Deletions,
# pushes to main, and non-branch refs such as tags are exempt.
#
# A failed fetch fails closed (pre-push and CI need the network anyway).
# --allow-offline warns and checks the last known origin/main instead, so
# commits stay fast and work offline.
set -u

allow_offline=false
# One "<commit> <branch name>" line per commit to check.
targets=
case "${1:-}" in
  '' | --allow-offline)
    [ "${1:-}" = --allow-offline ] && allow_offline=true
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
    echo "usage: $0 [--allow-offline | --pushed-refs]" >&2
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

# Concluding a conflicted `git merge origin/main` commits with origin/main only
# in MERGE_HEAD, so for HEAD that counts as containing it.
contains_origin_main() {
  git merge-base --is-ancestor refs/remotes/origin/main "$1" 2>/dev/null ||
    { [ "$1" = HEAD ] && git rev-parse -q --verify MERGE_HEAD >/dev/null &&
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

stale=false
while read -r commit name; do
  if [ -n "$commit" ] && ! contains_origin_main "$commit"; then
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
