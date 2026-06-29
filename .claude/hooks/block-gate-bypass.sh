#!/usr/bin/env sh
# PreToolUse(Bash) guard: settings.json filters this hook to Bash commands with
# a git subcommand (`if: Bash(git *)`). The script then refuses any attempt to
# skip the quality gates with `--no-verify`. The gates are not optional: an agent
# that hits a failing gate must fix the cause, not route around it.
# Exit code 2 blocks the tool call in Claude Code.
input="$(cat)"

# Normalise whitespace (newlines/tabs → spaces, squeezed) so the flag can't be
# hidden behind unusual spacing before we pattern-match it.
normalized="$(printf '%s' "$input" | tr '\n\t' '  ' | tr -s ' ')"

case "$normalized" in
  *--no-verify*)
    echo "Blocked: do not bypass the quality gates with --no-verify." >&2
    echo "Fix the failing gate instead (see .agents/project/DEFINITION_OF_DONE.md)." >&2
    exit 2
    ;;
esac

exit 0
