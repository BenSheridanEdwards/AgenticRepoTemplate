# REVIEW.md

Human-written rules for automated PR review. A bot reviewer — Cursor Bugbot,
Codex, or Claude — reads this file **after** the linter and CI have run, and
applies only the judgment rules below: the ones a gate leaves open.

Discovery: the start-here guide [`.agents/START_HERE.md`](.agents/START_HERE.md),
which the root `AGENTS.md` and `CLAUDE.md` point to, sends Codex and Claude here.
[`.cursor/BUGBOT.md`](.cursor/BUGBOT.md) sends Cursor Bugbot here.
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
- Hold each stacked migration piece to the 400-changed-line limit. Accept a
  self-contained single-idea PR above 400 lines when its body explains in one
  sentence why it is one idea, without requesting a split solely for size.
  Flag an over-400 PR that combines several ideas or lacks that sentence
  ([ADR 0074](.agents/decisions/0074-the-400-line-pr-limit-applies-to-stacked-migration-prs.md)).
- Flag a loop, a `let` accumulator or an in-place mutation where `map`,
  `filter`, `flatMap` or `reduce` expresses the transform. Lint holds only
  part of this rule (see the North Star's declarative principle).

## Naming and clarity

- Confirm identifiers use full words and the exact terms from
  [`.agents/project/GLOSSARY.md`](.agents/project/GLOSSARY.md); a name is the
  cheapest documentation the next agent reads.
- Flag a comment that restates the code or records a decision. Keep comments
  for the local reason behind a non-obvious line, and ask for an ADR for the
  decision.

## Changing the rules in the open

- A change that loosens or rewrites a gate waits for the enforcement sign-off,
  and arrives with the ADR that explains why. Confirm the ADR exists and its
  reasoning holds.
- A new dependency arrives with an ADR that names it. Confirm the ADR exists and
  that the dependency earns its place against the Ponytail bar above.

## Anti-slop findings

- Reviewers, including Claude Opus, run `pnpm lint:anti-slop:changed` on the
  clean, checked-out PR head. Raise each finding it prints as a change request
  naming the file, line and rule: the change adds a pattern the anti-slop
  rollout is removing.
- Flag a new `// SAFETY:` comment whose invariant the nearby code does not check.
- Flag a change that only hides a finding: a renamed symbol that still means
  "shape", an assertion split across two bindings, a `typeof` moved into a
  helper, or a value laundered through `unknown`.
- Check `vendor/anti-slop/UPSTREAM.md` for provenance and flag any vendored
  source edit that differs from the pinned upstream bytes.

## PR proof

- Confirm the PR names the outcome it moves and states what evidence would
  falsify the change, per [`.agents/project/PR_QUALITY.md`](.agents/project/PR_QUALITY.md).
- Confirm visual proof comes from the branch under review and shows the changed
  behaviour itself, committed under `docs/proof/<short-scope>/`.
- Confirm the body separates what passed locally, what CI proved on the latest
  commit, what a runtime verified, and what stays unverified.
- Confirm secrets, tokens, and customer names stay out of the PR body and the
  diff, and local-only paths stay out of the diff. The `PR quality` check owns
  machine-local paths in the body.
