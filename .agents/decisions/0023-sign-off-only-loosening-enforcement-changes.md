# 23. Ben signs off only the changes that loosen enforcement

- **Status:** Accepted
- **Date:** 2026-10-17
- **Supersedes in part:** [0007](0007-protect-enforcement-paths-by-default.md),
  [0018](0018-dependency-manifests-are-not-enforcement-paths.md)

## Context

The `enforcement-approval` gate from [ADR 0007](0007-protect-enforcement-paths-by-default.md)
asked for a sign-off on every change to a protected path. It protected the agent
docs, `.agents/**`, `.github/**`, `.claude/**`, and every root file, so a typo
fix in `AGENTS.md` waited on the same tick as turning a lint rule off. Any
reviewer with write access could tick the box. A tick also stayed valid across
pushes that left the protected files alone.

FLEET's lint guard ([FLEET #2202](https://github.com/BenSheridanEdwards/FLEET/pull/2202))
asks only when lint gets looser or its config is rewritten, accepts one approver,
and binds the tick to the head commit. This ADR brings the same model to this
repo's gate. The repo keeps one gate, one status, and one checkbox.

## Decision

### Who signs off, and for which commit

- `APPROVER` in [`scripts/enforcement-approval.mjs`](../../scripts/enforcement-approval.mjs)
  is `BenSheridanEdwards`. The gate turns green only when the last editor of its
  comment is that GitHub user. The gate reads the editor through the GraphQL
  `IssueComment.editor` field.
- The gate refuses a tick from any other account. It rewrites the comment
  unticked and posts a short note that names the editor.
- The comment names the PR head commit, and its checkbox reads
  `Approve these enforcement changes at <sha>`. Every push gives a new head,
  merging `main` in included. The gate then rewrites the comment unticked, and
  the status for the new head stays red until Ben ticks again.
- The workflow still runs main's copy under `pull_request_target`. It reads the
  PR's changed files and their contents at the merge base and at the head
  through the API, and it never runs PR code.

### What asks for a sign-off

The gate compares each guarded file at the merge base with the same file at the
head. The guard table `GUARDS` lists the guarded files in order, and the first
match decides the rule.

| Area | Files | Asks for sign-off when |
| --- | --- | --- |
| Enforcement-approval gate | `.github/workflows/enforcement-approval.yml`, `scripts/enforcement-approval.mjs`, `scripts/enforcement-approval.test.ts` | any edit |
| Required-gates contract | `docs/required-gates.md` | a line is removed or rewritten |
| Gate scripts | the rest of `scripts/**`, `scripts/required-gates.mjs` and the gate tests included | any edit |
| ESLint config and local rules | `eslint.config.*`, `tooling/**` | any edit |
| Biome config | `biome.json`, `biome.jsonc` | the config rules below |
| Fallow config | `.fallowrc.json`, `.fallowrc.jsonc` | the config rules below |
| TypeScript config | `tsconfig*.json` | the config rules below |
| CI workflows | `.github/workflows/**` | any edit |
| Git hooks | `.husky/**` | any edit |
| Claude Code settings and hooks | `.claude/settings.json`, `.claude/settings.local.json` | the config rules below |
| Claude Code settings and hooks | `.claude/hooks/**` | any edit |
| Test and commit config | `jest.config.*`, `playwright.config.*`, `commitlint.config.*`, `.commitlintrc*` | any edit |
| Ignore files Biome reads | `.gitignore` and `.ignore`, at any depth | an added line that is not a `#` comment or a `!` re-include, and a removed `!` re-include |

Code can loosen a gate in ways a text comparison cannot rank, and the gate never
runs PR code, so any edit to an enforcement script, its tests, a workflow, a
hook, or a JavaScript config asks for a sign-off. Deleting a guarded file also asks.

The config rules read the JSON files (comments and trailing commas allowed)
and compare each value at the merge base with the same value at the head:

1. **Ignore and allow lists.** Adding an entry to a list whose key contains
   `ignore`, `exclude`, or `allow` asks for a sign-off. Removing one passes.
2. **Include and deny lists** (`include`, `includes`, `files`, `deny`, `ask`).
   Adding a positive entry or removing a `!` negation passes. Removing a
   positive entry or adding a `!` negation asks. Creating an `include`,
   `includes`, or `files` list where none existed asks, because an absent list
   covers every file. Inside Biome `overrides`, any change to the files an
   override covers asks.
3. **Rule severity** under a `rules` key, ranked `off`, `info`, `warn` and `on`,
   then `error`. Lowering a rule asks, and so do adding a rule below `error` and
   removing a rule above `off`. Raising a rule, adding a rule at `error`, and
   removing an `off` rule pass.
4. **Strictness flags.** Setting a flag such as `strict`,
   `noUncheckedIndexedAccess`, `enabled`, or `recommended` to `false` asks, and
   so does removing one that was `true` or setting it to `null`. Setting a flag
   such as `skipLibCheck`, `noCheck`, `allowUnreachableCode`, `useIgnoreFile`,
   or `disableAllHooks` to `true` asks. `STRICT_WHEN_TRUE` and `LOOSE_WHEN_TRUE`
   in the script hold the full lists.
5. **Neutral settings pass.** These are `$schema`, the Biome `formatter` and
   language `formatter` settings, the
   TypeScript `ts-node` block, and every other TypeScript `compilerOptions` key
   (`target`, `lib`, `types`, and the rest).
6. **Any other added, removed, or changed value asks.** Examples are `extends`,
   Fallow zones, Claude Code hooks and `env`, Biome `assist` actions, and rule
   options.

A PR that lists 3000 files or more, the most the files API returns, asks for a
sign-off, because the gate cannot see every guarded file.

A change to any other file, app code and docs included, passes without a
comment. When a PR stops loosening enforcement, the gate replaces its comment
with a short note that has no checkbox.

### What this replaces

- From ADR 0007, this record replaces the protected-path list, the content
  checks, and the sign-off by any reviewer with write access.
- From ADR 0018, this record replaces the protected-path list it amended.
  `package.json` and `pnpm-lock.yaml` stay outside the gate.

## Consequences

- Docs, `.agents/**`, skills, the PR template, and app code merge on their
  checks alone. Tightening a JSON config also merges without a tick. For
  example, raising a Biome rule to `error`, adding a `tsconfig` strict flag, or
  adding a Claude Code `deny` entry needs no sign-off.
- Anyone acting with Ben's GitHub credentials can tick the box, a tool or an
  agent included. GitHub records `BenSheridanEdwards` as the editor, and the
  gate accepts it.
- A change to the approver is an edit to `scripts/enforcement-approval.mjs`, so
  the gate asks Ben for it. The new approver applies once the change lands on
  main.
- The status context stays `enforcement-approval`. Branch protection does not
  require it today, so the gate reports without blocking until a maintainer
  requires it.
- The gate reads text and JSON. A loosening hidden in a `package.json` script
  stays with the reviewer, as ADR 0018 records.
