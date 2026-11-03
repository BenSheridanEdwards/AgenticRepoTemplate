# 84. Reject every inline suppression

- **Status:** Accepted (merged in #251)
- **Date:** 2026-10-31
- **Replaces:** ADR 0039 (deleted), which blocked inline ESLint disables with
  `noInlineConfig`; [0103](0103-eslint-is-retired.md) retired that option

## Context

Result roots already reject suppression directives and coverage pragmas.
Elsewhere, a reasoned TypeScript, Biome or Fallow suppression could silence a
finding without changing a guarded file. The suppression checker read only
JavaScript and TypeScript and left coverage pragmas to review.

No live directive outside vendored code needed an exception when this change
was built. Directive examples in test strings and prose remain useful evidence.

## Decision

`pnpm check:suppressions` rejects every TypeScript, Biome, Oxlint, ESLint and
Fallow suppression and every Istanbul, c8 and v8 coverage pragma at the start
of a real comment's body. It checks tracked JavaScript and TypeScript variants,
CSS, JSON and JSONC. The TypeScript comment walker distinguishes comments from
strings, templates and JSX text; a small scanner handles strings and comments
in CSS and JSONC. JSON uses the same scanner as JSONC.

An exception is a `{ path, directive, reason }` entry in the exported
`ALLOWED_SUPPRESSIONS` constant in `scripts/check-suppressions.mjs`. That file
already needs enforcement sign-off. The list starts empty. An entry covers
only its named directive in its named file, needs a reason, and fails when no
directive matches it.

A lint exception that is not an inline directive is a config entry, a `files`
override or rule setting in `oxlint.config.ts` or `biome.json`, with a comment
naming its reason, as ADR 0039 first required.

Keep `vendor/` excluded because it holds third-party code. Keep the stricter
result-root structure rule, which permits no suppression exception. Keep each
engine's own suppression checks as a second line of enforcement.

## Consequences

Fix the finding's cause before proposing an exception in the reviewed
allowlist. A reason in a source comment alone no longer permits a suppression
outside result roots. This ends the reasoned-suppression allowance described
in the earlier decision without changing application behaviour.

Tests reject every directive family, verify the shared forms against the
structure gate, preserve string and prose examples, and exercise CLI failures
with file, line and remedy. They also reject stale allowlist entries.
