# 20. Block the common hook bypasses, not only the long flag

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-16
- **Amends:** [0005](0005-scope-claude-hooks-to-gate-bypass.md)

## Context

[0005](0005-scope-claude-hooks-to-gate-bypass.md) scoped the Claude hook to one
flag: it blocked a command only when the long `--no-verify` flag appeared in it.
`AGENTS.md` rule 4 said "(A hook enforces this.)", but git has other ways to
skip the hooks, and the guard let them through:

- `git commit -n` and short-flag clusters such as `-nm`
- `HUSKY=0`, which Husky reads to skip every hook
- `git -c core.hooksPath=...`, `--config-env`, `GIT_CONFIG_PARAMETERS`, and
  `git config core.hooksPath <elsewhere>`, which point git away from `.husky/_`
- a git alias (`git config alias.ci 'commit -n'`, then `git ci`) or a config
  include file that sets `core.hooksPath`
- `--no-veri`, an abbreviation that git accepts for `--no-verify`
- quote and backslash splitting: `--no-ver''ify`, `"-n"`, `HU""SKY=0`, and
  `core.hooks\Path` all reach git as the plain flag

In practice, two separate agent runs pushed PR #55 with `HUSKY=0` and skipped the
pre-push gates.

The `if: Bash(git *)` filter had a second gap. Running the real Claude Code CLI
(2.1.300) against a stub model endpoint showed what it matches:

| Command shape | Hook spawned? |
| --- | --- |
| `git commit ...` | yes |
| `HUSKY=0 git commit ...` (env assignment prefix) | yes |
| `cd x && git commit ...` (compound) | yes |
| `env git commit ...` | **no** |
| `sh -c "git commit ..."` / `bash -c '...'` | **no** |

The filter strips leading `VAR=value` assignments and splits compound commands.
It does not look inside `env`, `sh -c`, or `bash -c`. Commands in those three
shapes never reached the script at all.

## Decision

Keep 0005's two layers and widen both:

1. `.claude/settings.json` adds three more hook entries with
   `if: Bash(env *)`, `if: Bash(sh *)`, and `if: Bash(bash *)`. They run the
   same script. Ordinary commands such as `pnpm`, `ls`, or `cat` still spawn
   nothing.
2. `.claude/hooks/block-gate-bypass.sh` reads only `tool_input.command` from
   the hook JSON (with `node`, which the repo already requires), so the free-text
   `description` never causes a block. It then flattens the command:
   - A quoted `-m`/`--message` argument becomes `MSG`, so
     `git commit -m "docs: explain -n"` passes. Only an unquoted `-m` counts,
     and only a message with no quote, `$`, or backtick inside, so
     `-m "$(git commit -n)"` and a fake `-m '` inside another string hide
     nothing.
   - Every `"`, `'`, and `\` is deleted, so split flags read as the flag.

   On the flattened text it blocks:
   - `--no-verify` and its abbreviations down to `--no-veri`
   - `git commit -n` wherever `n` appears in a short-flag cluster before a flag
     that takes a value (`-n`, `-nm`, `-an`; not `-mn` or `-uno`)
   - `HUSKY=0`, and any `HUSKY=` value built by `$` or backtick expansion
   - any mention of `core.hooksPath`, `alias.*`, `include.path`, or
     `includeIf.*` that is not a read (`git config --get`, `--get-regexp`,
     `--list`, or `git config core.hooksPath` with no value) or a reset of
     `core.hooksPath` to `.husky/_` or `.husky`

The error names the fix: fix what the gate reports and see
`.agents/project/DEFINITION_OF_DONE.md`. If `node` is missing or the input is
not JSON, the hook blocks.

`scripts/block-gate-bypass.test.ts` pipes a realistic PreToolUse payload for a
table of blocked and allowed commands into the script under both `sh` and
`bash`, and checks that `.claude/settings.json` spawns it for exactly those four
`if` filters.

## Consequences

- The bypasses seen in use, and the common variants of them, are refused before
  they run.
- Where the guard has to choose, it blocks. Accepted false positives:
  - `git commit -m x -- -n` and `git log --grep commit -n 3` read as
    `git commit -n`.
  - A heredoc or `$(...)` message that names a bypass is not set aside; write
    the message to a file and use `git commit -F <file>`.
  - `bash -c 'git commit -m "docs: -n"'`: a message inside an outer quoted
    string is not set aside.
  - Any `env`, `sh`, or `bash` command that mentions a bypass is blocked, even
    when it would not run git. So is `HUSKY=$X`.
- The guard is a speed bump, not a sandbox. Known gaps it does not catch:
  - `eval`, `xargs`, and wrappers the `if` filter does not spawn on:
    `command git`, `exec git`, `time git`, `nice git`, `/usr/bin/git`, and
    similar
  - subshells and other shells (`zsh -c`, `dash -c`), and committed scripts
  - git plumbing that skips hooks by design (`git send-pack`,
    `git commit-tree` plus `git update-ref`)
  - deleting or editing `.husky` files, or editing `.git/config` with the
    Edit or Write tools
  - pointing git at another config file (`GIT_CONFIG_GLOBAL`,
    `GIT_CONFIG_SYSTEM`) written beforehand
  - shell expansion tricks such as globs, `read`, `printf -v`, or `$'...'`
    escapes that build a flag at run time

  CI on a clean checkout stays the backstop
  ([0002](0002-quality-gates-as-code.md)).
- New bypass shapes go into the test table first, then the script.
