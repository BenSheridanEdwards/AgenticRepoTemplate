# 61. Refine the software factory philosophy

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-24
- **Builds on:** [0001](0001-record-architecture-decisions.md),
  [0021](0021-guidance-docs-state-the-action.md),
  [0039](0039-block-inline-lint-disable-comments.md),
  [0046](0046-fail-lint-on-warnings.md),
  [0050](0050-anti-slop-lint-policies.md)

## Context

On 24 October 2026 Ben refined the software factory philosophy: slop is
agents writing overly complex code that breaks the agreed conventions, and
the toolchain enforces those conventions; declarative code over imperative;
and layering, where each layer imports only below it, one feature imports
no other, and decisions live in decision records rather than comments.

The repository stated the philosophy in `.agents/NORTH_STAR.md`, `README.md`,
`.agents/START_HERE.md` and the project docs, but did not define slop, said
nothing about declarative code, and the README still listed the ADR 0050
lint rules as missing.

## Decision

- The North Star defines slop and states the three points: principle 1 gains
  where each check runs, how common skipping attempts are refused, which
  warnings fail and that ESLint ignores disable comments; principle 2 becomes
  "Layers import downward, slices stand alone, decisions live in ADRs"; new
  principle 9 states declarative over imperative.
  Principle numbers 1 to 8 stay, because lint config comments cite §1.
- The README, the start-here guide, `CONVENTIONS.md`, `QUALITY_GATES.md`,
  `GLOSSARY.md` and `REVIEW.md` state the same rules consistently.
- Each statement names its real owner or says "Not enforced yet":
  - Pre-commit runs typecheck, staged Biome, Fallow and gitleaks; ESLint
    policy, the structure check and the tests run on pre-push and in CI.
    Git skips pre-commit on a conflict-free merge, and Fallow's audit needs a
    base branch. Every convention check before every commit remains a target.
  - The bypass hook is a speed bump with the gaps ADR 0027 lists.
  - Warnings fail Biome, ESLint and React Doctor; Fallow's warn-level
    findings still pass.
  - ESLint ignores inline config; `biome-ignore`, `@ts-expect-error` and
    `fallow-ignore` still apply with a reason outside result roots. The
    structure check rejects these directives and coverage pragmas in both
    the reference `apps/` and `showcase/<id>/`; coverage pragmas elsewhere
    remain a review concern.
  - Declarative code is partly enforced by Biome `style/useConst` and
    `react-hooks/immutability`, `react-hooks/globals` and `react-hooks/purity`;
    loops and general mutation are not enforced.
  - Layering holds for value imports through Fallow; type-only imports cross
    roles under ADR 0037. Within-role imports remain allowed subject to slice
    isolation; tests, E2E specs, configs, scripts and tooling sit outside the
    role table. Feature isolation is ESLint `policy/slice-isolation` for
    static relative module references, including type imports. Computed
    specifiers and non-relative aliases remain gaps in that rule.
  - `policy/no-large-comments` limits comment length in package TypeScript
    source; whether a comment holds a decision is review's call.
- Existing gate rules and configs stay as they are.
  [ADR 0062](0062-pre-commit-steps-stay-under-30-seconds.md) records this PR's
  hook change: the up-to-date check leaves pre-commit, and each remaining
  pre-commit step must finish in under 30 seconds. Hook scripts, tests and the
  generated gate inventory follow that placement.

## Consequences

- An agent reads one definition of slop and one set of rules in every
  context doc, and each rule says what holds it.
- The gaps become visible targets. Closing one needs its own ADR, and a
  change to a guarded lint file waits for the enforcement sign-off under
  ADR 0024. Candidates: a declarative-code rule (it must coexist with Biome
  `noAccumulatingSpread`), Fallow warnings as failures, ESLint policy in
  pre-commit, the comment cap outside package TypeScript source.
- Scripts and tooling hold loops and mutation today; the principle applies to
  new code first, and existing code changes only when touched.
