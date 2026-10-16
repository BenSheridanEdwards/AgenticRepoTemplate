# 17. Block every hook bypass, not only the long flag

- **Status:** Accepted (pending Ben's sign-off on the PR)
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
- `--no-veri`, an abbreviation that git accepts for `--no-verify`

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
2. `.claude/hooks/block-gate-bypass.sh` blocks:
   - `--no-verify` and its abbreviations down to `--no-veri`
   - `git commit -n` wherever `n` appears in a short-flag cluster before a flag
     that takes a value (`-n`, `-nm`, `-an`; not `-mn` or `-uno`)
   - `HUSKY=0` in any form
   - any mention of `core.hooksPath` except reading it
     (`git config [--get] core.hooksPath`) or setting it back to `.husky/_` or
     `.husky`

The script matches the raw hook input. It does not strip quoted text, so
`bash -c 'git push --no-verify'` is blocked. The only quoted text it sets aside
is a `-m`/`--message` argument with no `$` or backtick. That way
`git commit -m "docs: explain -n"` still works, and `-m "$(git commit -n)"`
cannot hide a bypass. The error names the fix: fix what the gate reports and
see `.agents/project/DEFINITION_OF_DONE.md`.

`scripts/block-gate-bypass.test.ts` pipes a table of blocked and allowed
commands into the script under Jest.

## Consequences

- Every bypass that has been seen in use is now refused before it runs.
- Where the guard has to choose, it blocks. A commit message that names
  `--no-verify`, `HUSKY=0`, or `core.hooksPath` is refused even inside
  `-m "..."`; write the message to a file and use `git commit -F <file>`.
  So is a `-m` message that contains `$`. Any `env`, `sh`, or `bash` command
  that mentions a bypass is blocked, even when it would not run git.
- The guard is a speed bump, not a guarantee. Shapes the filter does not
  match, such as `eval`, `xargs git`, other shells, and committed scripts,
  still get through. CI on a clean checkout stays the backstop
  ([0002](0002-quality-gates-as-code.md)).
- New bypass shapes go into the test table first, then the script.
