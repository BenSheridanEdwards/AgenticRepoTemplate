#!/usr/bin/env sh
# PreToolUse(Bash) guard: settings.json spawns this hook for Bash commands that
# run git, directly or through `env`, `sh`, or `bash` (ADR 0005, amended by
# ADR 0017). The script refuses every known way to switch the git hooks off:
#
#   --no-verify (and its abbreviations down to --no-veri)
#   git commit -n, alone or in a short-flag cluster such as -nm or -an
#   HUSKY=0, in any form (prefix, export, env, quoted)
#   core.hooksPath set or unset by any route: git -c, --config-env,
#     GIT_CONFIG_PARAMETERS, GIT_CONFIG_KEY_n, or git config. Reading it
#     (git config --get core.hooksPath) and setting it back to Husky's own
#     .husky/_ (or .husky) stay allowed.
#
# The gates are not optional: an agent that hits a failing gate must fix the
# cause, not route around it. Exit code 2 blocks the tool call in Claude Code.
#
# The script matches the raw hook JSON, so quoted text in the command is
# visible: `bash -c 'git push --no-verify'` is blocked. Only one kind of quoted
# text is set aside, the argument of `-m`/`--message`, and only when it has no
# `$` or backtick (no command substitution), so `git commit -m "docs: -n"`
# passes. A commit message that names --no-verify, HUSKY=0, or core.hooksPath is
# still blocked; write it to a file and use `git commit -F <file>`.
input="$(cat)"

# Turn JSON newline/tab escapes and real whitespace into single spaces so a flag
# cannot hide behind a line break or unusual spacing.
normalized="$(printf '%s' "$input" | tr '\n\t\r' '   ' | sed 's/\\[nrt]/ /g' | tr -s ' ')"

block() {
  echo "Blocked: $1 switches off the quality gates." >&2
  echo "Fix what the gate reports instead; see .agents/project/DEFINITION_OF_DONE.md." >&2
  echo "If a commit message only names the flag, write it to a file and use git commit -F <file>." >&2
  exit 2
}

has() { printf '%s' "$normalized" | grep -Eq -e "$1"; }

has '--no-veri' && block '--no-verify'

# HUSKY=0, HUSKY="0", HUSKY='0' (JSON escapes the double quote as \").
has '(^|[^A-Za-z0-9_])HUSKY=(\\"|'"'"')?0' && block 'HUSKY=0'

# git commit -n: set aside -m/--message arguments without $ or backtick, then
# look for a short-flag cluster where n comes before any flag that takes a
# value (m, F, c, C, t, S, u), so -nm and -an block but -mn (message "n") and
# -uno (untracked=no) do not.
without_messages="$(printf '%s' "$normalized" | sed -E \
  -e 's/(-[A-Za-z]*m|--message)(=|[[:space:]]+)\\"([^\\$`]|\\[^"$`])*\\"/\1 MSG/g' \
  -e "s/(-[A-Za-z]*m|--message)(=|[[:space:]]+)'[^'\$\`]*'/\1 MSG/g")"
printf '%s' "$without_messages" |
  grep -Eq 'git[[:space:]]([^;&|]*[[:space:]])?commit[[:space:]]([^;&|]*[[:space:]])?-[apsvqeioz]*n[A-Za-z]*([^A-Za-z-]|$)' &&
  block 'git commit -n'

# core.hooksPath: drop the allowed reads and the reset to Husky's own path,
# then any remaining mention is a rewrite (git -c, --config-env,
# GIT_CONFIG_PARAMETERS, GIT_CONFIG_KEY_n, git config set or --unset).
q='(\\"|'"'"')?'
end='([[:space:];&|"]|$)'
key="git[[:space:]]+config[[:space:]]+(--(local|global|system|worktree)[[:space:]]+)?"
# git config keys are case-insensitive; spelled out because BSD sed has no /I.
hp='[Cc][Oo][Rr][Ee]\.[Hh][Oo][Oo][Kk][Ss][Pp][Aa][Tt][Hh]'
rest="$(printf '%s' "$normalized" | sed -E \
  -e "s/${key}(--get|--get-all|get)[[:space:]]+${q}${hp}${q}${end}/ ; /g" \
  -e "s/${key}(set[[:space:]]+)?${q}${hp}${q}[[:space:]]+${q}\.husky(\/_)?\/?${q}${end}/ ; /g" \
  -e "s/${key}${q}${hp}${q}[[:space:]]*([;&|\"]|$)/ ; /g")"
printf '%s' "$rest" | grep -Eiq 'core\.hookspath' && block 'rewriting core.hooksPath'

exit 0
