# 49. Human-written review rules the bot reviewers read

- **Status:** Proposed (Ben accepts it by approving the PR); the `AGENTS.md` wiring line superseded by [0053](0053-root-pointers-name-start-here.md)
- **Date:** 2026-10-21
- **Builds on:** [0021](0021-guidance-docs-state-the-action.md), [0024](0024-sign-off-only-loosening-enforcement-changes.md)

## Context

The North Star roadmap lists `REVIEW.md` — "Human-written rules for automated
PR review, read after lint" — as its one remaining target. It comes from
Sarah Fim's anti-slop software factory, which pairs a tightly-configured linter
with a human-written `BUGBOT.md` the bot reviewer reads for what lint cannot
decide
([video](https://x.com/sarahfim/status/2108298553823203613),
[write-up](https://x.com/sarahfim/status/2109736893198016898)).

Until now the repo had no such file. A bot reviewer (Cursor Bugbot, Codex, or
Claude) re-derived the project's review priorities from scratch on each PR,
which is the "review its own slop" loop the factory exists to close. Issue #112
asks for the file, wired the way each reviewer discovers rules.

The repo's own principle is "Lint beats instructions": deterministic rules
belong in gates, and the tables in `.agents/project/CONVENTIONS.md` and
`QUALITY_GATES.md` already name each gate. A prose file is only worth adding for
the judgment rules a gate leaves open, and only if the wiring that makes
reviewers read it cannot silently rot.

## Decision

- The canonical file is `REVIEW.md` at the repository root. It holds only the
  judgment rules lint and CI leave open — correctness and test judgment,
  layering intent, scope and simplicity, naming clarity, changing rules in the
  open, and PR-proof judgment. It restates no rule a gate already owns, and it
  states each rule as the action to take, so `pnpm check:docs` reads it like any
  other guidance doc.
- Each reviewer discovers it the way it actually reads rules. The root
  `AGENTS.md` references `REVIEW.md`, which Codex and Claude read. `.cursor/BUGBOT.md`
  points Cursor Bugbot at the same file. One source of truth, three readers.
- `scripts/check-context-layer.mjs` gates the wiring: it fails when `REVIEW.md`
  is missing, when `AGENTS.md` stops referencing it, or when `.cursor/BUGBOT.md`
  is missing or stops referencing it. The check already runs in `pnpm verify`,
  the pre-push hook and the CI `quality` job through `pnpm check:context`, so no
  workflow and no required-gates inventory changes.
- The rules themselves stay judgment, not a gate. When a judgment finding
  recurs, the fix is a lint rule in a new ADR, per "Lint beats instructions",
  not a longer `REVIEW.md`.

### Alternatives considered

- **Put the rules in `.cursor/BUGBOT.md` as canonical and reference it from
  `AGENTS.md`.** Cursor's path is tool-specific, while `REVIEW.md` at the root
  is the vendor-neutral name the North Star already uses. The pointer runs the
  other way instead.
- **Keep the rules only in `AGENTS.md`.** Cursor Bugbot discovers `.cursor/BUGBOT.md`,
  not an arbitrary doc, so a Cursor review would miss them. A dedicated file
  with a Cursor pointer reaches every reviewer.
- **Leave the wiring ungated.** A deleted file or a dropped reference would turn
  the rules off with no signal, the exact failure the context-layer check exists
  to prevent for the rest of the context layer.
- **Enforce the rules' content.** They are judgment rules by definition; a
  deterministic one belongs in lint through its own ADR, which keeps `REVIEW.md`
  short.

## Consequences

- `REVIEW.md` moves from a North Star target to installed: its existence and its
  wiring to all three reviewers are now gated by `pnpm check:context`, with a
  unit test that deletes or unlinks each piece and asserts the failure.
- The file stays short by design. Growth is a signal to turn a recurring finding
  into a lint rule, not to keep adding prose.
- A reviewer that reads `REVIEW.md` trusts the gates for everything they own, so
  the two layers stay complementary rather than duplicated.
