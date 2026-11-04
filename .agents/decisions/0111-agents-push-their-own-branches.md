# 111. Agents push their own branches

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

`.claude/settings.json` denied `git push` from the first scaffold. A deny rule
overrides every permission mode, so Claude Code could commit and pass every
gate but had to hand each branch to the maintainer to push before it could open a pull
request. The rule duplicated protection the repository already has.

## Decision

Remove `Bash(git push:*)` from the Claude Code deny list. Agents push their
own branches and open their own pull requests.

Keep the protections that make a push safe: the pre-push hook runs the gates,
`.agents/hooks/block-gate-bypass.sh` refuses the hook bypasses listed in
[ADR 0027](0027-block-common-hook-bypasses.md), and branch protection with
`Required gates` and the enforcement sign-off governs what reaches main. Keep
the deny rules for `git reset --hard`, `git clean` and `rm -rf`.

## Consequences

An agent's branch reaches GitHub without waiting for the maintainer, so PR checks start
sooner. A force push stays possible; branch protection keeps it off main.
