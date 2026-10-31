@AGENTS.md

## How to use this file

- Trust gates for the rules they own, listed in [CONVENTIONS.md](.agents/project/CONVENTIONS.md) and [QUALITY_GATES.md](.agents/project/QUALITY_GATES.md). Apply judgment to what they leave open.
- Raise specific, actionable findings naming the file, line, and rule.
- When a judgment finding recurs, propose a lint rule in an ADR so the gate owns it next time, per [the North Star](docs/NORTH_STAR.md).

## Correctness and tests

- Confirm every bug fix includes a regression test in the same PR that fails on the unfixed code and asserts the user-visible symptom.
- Confirm each user-visible behaviour change maps to a spec in the result's `web/e2e/` behaviour map. Check that the spec describes behaviour rather than implementation.
- Check tests use the accessibility tree and public API, so they survive refactors that preserve behaviour.
- Flag tests that pass whether or not the change works; passing on unfixed code proves nothing.

## Architecture and layering judgment

- Confirm hooks wire state, components compute derived values during render, and pure functions hold logic. [ARCHITECTURE.md](.agents/project/ARCHITECTURE.md) defines the roles; Fallow gates imports, and review holds their intent.
- Confirm data crossing an IO boundary (network, storage, environment) is parsed with Effect Schema before its type is trusted.
- Confirm a missing boundary precondition throws a clear error rather than resolving to a silent default.
- Check shared UI uses `@repo/ui` primitives and duplicated feature UI is deliberate rather than a missed primitive.

## Scope and simplicity

- Keep the smallest diff that delivers the change. Flag unrelated churn, renames, or reformatting and ask for them in their own PR.
- Prefer deletion, existing patterns, and stdlib or platform features over new abstractions or dependencies.
- Confirm one logical change per PR, so a reviewer can hold the whole change in mind.
- Hold each stacked migration piece to 400 changed lines. Accept a self-contained single-idea PR above 400 when its body explains in one sentence why it is one idea, without requesting a split solely for size. Flag an over-400 PR combining ideas or lacking that sentence ([ADR 0074](.agents/decisions/0074-the-400-line-pr-limit-applies-to-stacked-migration-prs.md)).
- Flag loops, `let` accumulators, or in-place mutation where `map`, `filter`, `flatMap`, or `reduce` expresses the transform. Lint owns part of [the declarative principle](docs/NORTH_STAR.md#9-declarative-over-imperative).

## Naming and clarity

- Confirm identifiers use full words and exact [glossary terms](docs/GLOSSARY.md); names are the cheapest documentation the next agent reads.
- Flag comments that restate code or record decisions. Keep comments for the local reason behind a non-obvious line; ask for an ADR for decisions.

## Changing the rules in the open

- Confirm changes that loosen or rewrite gates wait for enforcement sign-off and include an ADR whose reasoning holds.
- Confirm a new dependency has an ADR naming it and earns its place against the simplicity bar above.

## Anti-slop findings

- Flag new `// SAFETY:` comments whose invariant the nearby code fails to check.
- Flag changes that only hide findings: splitting an assertion across bindings, moving `typeof` into a helper, or laundering a value through `unknown`.
- Check `vendor/anti-slop/UPSTREAM.md` for provenance and flag vendored source edits that differ from pinned upstream bytes.
