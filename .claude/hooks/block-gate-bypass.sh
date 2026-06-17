#!/usr/bin/env sh
# PreToolUse(Bash) guard: refuse any command that tries to skip the quality
# gates with `git commit/push --no-verify`. The whole point of the gates is that
# they are not optional — an agent that hits a failing gate must fix the cause,
# not route around it. Exit code 2 blocks the tool call in Claude Code.
input="$(cat)"

case "$input" in
  *--no-verify*)
    echo "Blocked: do not bypass the quality gates with --no-verify." >&2
    echo "Fix the failing gate instead (see .agents/project/DEFINITION_OF_DONE.md)." >&2
    exit 2
    ;;
esac

exit 0
