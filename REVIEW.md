# REVIEW.md

Human-written rules for automated PR review. A bot reviewer — Cursor Bugbot,
Codex, or Claude — reads this file **after** the linter and CI have run, and
applies only the judgment rules below: the ones a gate leaves open.

Discovery: the root [`AGENTS.md`](AGENTS.md) points here for Codex and Claude,
and [`.cursor/BUGBOT.md`](.cursor/BUGBOT.md) points Cursor Bugbot here.
`pnpm check:context` keeps that wiring in place.

## How to use this file

- Trust the gates for everything they own. The deterministic rules live in
  types, lint, tests, and CI; [`.agents/project/CONVENTIONS.md`](.agents/project/CONVENTIONS.md)
  and [`.agents/project/QUALITY_GATES.md`](.agents/project/QUALITY_GATES.md) list
  each one beside its check. Review here for what those gates leave to judgment.
- Raise each finding as a specific, actionable comment that names the file, the
  line, and the rule it touches.
- When the same judgment finding recurs, propose a lint rule in an ADR so the
  gate owns it next time. Prose rules go stale; a lint rule closes the loop (see
  [`.agents/NORTH_STAR.md`](.agents/NORTH_STAR.md)).

## Correctness and tests

- Confirm every bug fix ships, in the same PR, with a regression test that fails
  on the unfixed code and asserts the user-visible symptom.
- Confirm a user-visible behaviour change maps to a spec in the result's
  `web/e2e/` behaviour map, and that the spec describes the behaviour rather than
  the implementation.
- Check that tests assert behaviour through the accessibility tree and the
  public API, so they survive a refactor that keeps behaviour.
- Flag a test that passes whether or not the change works, since a test that
  would also pass on the unfixed code proves nothing.

## Architecture and layering judgment

- Confirm each file plays its role: hooks wire state, components compute derived
  values during render, and pure functions hold logic.
  [`.agents/project/ARCHITECTURE.md`](.agents/project/ARCHITECTURE.md) holds the
  role table; Fallow gates the imports, and review holds the intent behind them.
- Confirm data crossing an IO boundary — network, storage, environment — is
  parsed with Effect Schema before the code trusts its type.
- Confirm boundaries fail loudly: a missing precondition throws with a clear
  message rather than resolving to a silent default.
- Check that shared UI uses the `@repo/ui` primitives, and that duplicated
  feature-level UI is a deliberate choice rather than a missed primitive.

## Scope and simplicity

- Keep the diff the smallest one that delivers the change. Flag churn, renames,
  or reformatting unrelated to the stated goal, and ask for them in their own PR.
- Prefer deletion, an existing pattern, and a stdlib or platform feature over a
  new abstraction or dependency (the repo's Ponytail discipline).
- Confirm one logical change per PR, so a reviewer holds the whole change in mind.

## Naming and clarity

- Confirm identifiers use full words and the exact terms from
  [`.agents/project/GLOSSARY.md`](.agents/project/GLOSSARY.md); a name is the
  cheapest documentation the next agent reads.
- Flag a comment that restates the code; keep comments for the reason behind a
  non-obvious choice.

## Changing the rules in the open

- A change that loosens or rewrites a gate waits for the enforcement sign-off,
  and arrives with the ADR that explains why. Confirm the ADR exists and its
  reasoning holds.
- A new dependency arrives with an ADR that names it. Confirm the ADR exists and
  that the dependency earns its place against the Ponytail bar above.

## PR proof

- Confirm the PR names the outcome it moves and states what evidence would
  falsify the change, per [`.agents/project/PR_QUALITY.md`](.agents/project/PR_QUALITY.md).
- Confirm visual proof comes from the branch under review and shows the changed
  behaviour itself, committed under `docs/proof/<short-scope>/`.
- Confirm the body separates what passed locally, what CI proved on the latest
  commit, what a runtime verified, and what stays unverified.
- Confirm secrets, tokens, and customer names stay out of the PR body and the
  diff. The `PR quality` check owns machine-local paths in the body.
