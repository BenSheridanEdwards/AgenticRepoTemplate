# 51. The PR body names no machine-local path

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-22
- **Builds on:** [0020](0020-pr-process-checks.md), [0029](0029-pr-body-names-its-head-commit.md)

## Context

The rule already stood in `PR_QUALITY.md`, `REVIEW.md` and the PR template,
but it lacked a check that owned it. Merged PRs #8, #9, #11 and #13 cited
`/Users/agents/...`; #58 cited `/tmp/lhproof/classify.sh` as its proof
script; #92 published `/workspace/mono/scratch/...` paths. These paths are
inaccessible to a reviewer and show the author's machine layout.

## Decision

`scripts/validate-pr-body.mjs` scans the whole raw body, including code spans,
fenced blocks and HTML comments, because all of it is published. A match starts
at a line start, after whitespace, or after one of the following characters:
backtick, `'`, `"`, `(`, `[`, `<`, `=`, `:`. It then begins with one of:

- `/Users/<name>/`
- `/home/<name>/`
- `/root/`
- `/workspace/`
- `/tmp/<segment>`
- `/private/var/`
- `/var/folders/`
- `<drive>:\Users\`
- `file://`

A path inside a URL or a repo-relative path (`docs/tmp/x.md`) passes, and a bare
`/tmp` names a concept and passes. Trailing sentence punctuation is excluded
from the path. Each distinct path is reported once with its line number. The
error quotes it cut to 40 characters and names the fix: a repo-relative path, a
placeholder such as `<workdir>/repo`, or the command to rerun.

`~/` stays out of the list: it names a tool's standard config location, the same
on every machine, rather than one machine's layout. The `PR quality` workflow
already runs the script, so `.github/workflows/pr-quality.yml` stays unchanged.
Its header comment, which lists the checks, trails the script by this one check.
The change tightens a gate, so ADR 0024's sign-off does not apply.

## Consequences

- Open PRs whose bodies cite such paths fail until the body is edited. The
  workflow re-runs on `edited`.
- A PR whose subject is the trial temp folders, such as #94, #99 and #110,
  which described `/tmp` log files and config entries as the work itself, now
  names them with placeholders such as `<tmp>/verify.log`.
- Evidence lives behind commands, links, or committed `docs/proof/` files.
- The prefix list is fixed, so a new machine layout needs a new prefix and a
  test.
- Commit messages stay outside this check; checking them needs the guarded
  `commitlint.config.ts`.
