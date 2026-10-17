# 20. PR-process rules are checked by repository scripts

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

[`DEFINITION_OF_DONE.md`](../project/DEFINITION_OF_DONE.md),
[`PR_QUALITY.md`](../project/PR_QUALITY.md), and the PR template stated the PR
proof rules as prose and checkboxes. The `PR quality` check only confirmed that
an image marker or the words `Not applicable` appeared in the proof section. A
PR could link a screenshot that never renders, write `Not applicable` with no
reason, or use a branch name outside the
[`CONVENTIONS.md`](../project/CONVENTIONS.md) pattern, and every check passed.
[`AGENTS.md`](../../AGENTS.md) and [`TECH_STACK.md`](../project/TECH_STACK.md)
ask for an ADR with each new dependency, and nothing checked that either.

## Decision

- [`scripts/validate-pr-body.mjs`](../../scripts/validate-pr-body.mjs), run by
  the `PR quality` workflow, also fails:
  - an inline image that is not an absolute `https://` URL;
  - a GitHub blob image URL without `?raw=1` or `?raw=true`;
  - a plain link to an image file in the proof section, since proof is
    embedded;
  - `Not applicable` with no reason on the same line or the next one;
  - a head branch outside `<type>/<short-kebab-summary>`. The workflow passes
    the branch through `PR_HEAD_REF` as JSON, the same way it passes the title
    and body. Nested, versioned, and GitHub revert branch names pass.
- Images and links inside code spans and fenced blocks are examples, so the
  validator reads past them. The title and branch checks share one Conventional
  Commit type list that matches `commitlint.config.ts`.
- [`scripts/check-dependency-adr.mjs`](../../scripts/check-dependency-adr.mjs)
  (`pnpm check:adr`) compares the committed `package.json` at the merge base
  with the base ref against `HEAD`. It fails when a dependency name is new in any
  dependency field and no ADR added in the same change names it. Version bumps
  pass. An unresolvable base fails closed.
- `pnpm verify`, `scripts/verify-gates.sh`, and the CI quality job run
  `pnpm check:adr`. The quality job checks out full history so the merge base
  resolves.
- Both checks are repository scripts with no new dependency.

## Consequences

- The guidance docs list what the `PR quality` check enforces once, and keep
  prose only for the calls a reviewer makes: what a screenshot shows, whether a
  test maps to the changed behaviour, and whether a replacement verification is
  enough.
- The stricter validator applies to every open PR on its next `edited` or
  `synchronize` event, so an older PR body may need its proof line updated.
- `check:adr` covers the dependency case of "change a rule through an ADR".
  Recognising any other rule change stays with the reviewer.
- Both scripts sit under `scripts/` and the workflows under `.github/`, so
  changes to them need the enforcement sign-off from
  [ADR 0007](0007-protect-enforcement-paths-by-default.md).
