# 81. Guidance docs ban em dashes and AI filler

- **Status:** Proposed
- **Date:** 2026-10-29
- **Follows:** [ADR 0021](0021-guidance-docs-state-the-action.md)

## Context

The plain-language pass removed filler by hand. A short, precise check keeps
those phrases from returning without banning technical terms such as `key`,
`underscore` or the `showcase` folder name.

## Decision

Extend `scripts/check-doc-phrasing.mjs`, run by `pnpm check:docs`, with a pure
`findSlop(text)` finder. Reject U+2014 em dashes and this case-insensitive list
with word boundaries around the phrases:

- `in order to`, `due to the fact that`, `at this point in time`, `in the event that`
- `has the ability to`, `have the ability to`, `it is important to note`
- `it's worth noting`, `it is worth noting`, `delve`, `tapestry`, `testament to`
- `pivotal`, `seamless`, `seamlessly`, `at its core`, `evolving landscape`
- `let's dive`, `without further ado`, `I hope this helps`

These follow humanizer sections 7, 23 and 28 and unslop items 1, 7, 13, 20 and
23. Keep en dashes and hyphens, and the words `ensure`, `additionally` and
`robust`, which have plain uses here.

Use the existing guidance scope, minus `docs/trials/**`. Keep
`.agents/decisions/**` out because ADR bodies are records, and keep the
vendored, hash-pinned `.agents/skills/show-me/SKILL.md` out.
`tooling/trial/fixtures/**` and other non-guidance Markdown already fall
outside `isGuidanceDoc`. Ignore code spans, link targets and fenced code by
reusing `proseOf` and `nextFence`. Preserve the negative-phrasing check and
its scope.

## Consequences

The CLI reports each path, line and matched phrase with one fix hint. Writers
replace an em dash with a comma, colon, period or parentheses and cut filler.
The list checks words rather than intent; tests cover every entry and the
scope exclusions. This adds no dependency and changes no application behaviour.
