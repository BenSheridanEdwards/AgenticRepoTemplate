# 98. Oxlint replaces ESLint

- **Status:** Proposed; Completed by ADR 0103
- **Date:** 2026-11-01
- **Amends:** 0010, 0015, 0019 and [0073](0073-adopt-the-typescript-toolchain-standard.md). K10 records their supersessions.

## Context

Ben asked on 31 October: "Replace ESLint with Oxlint ENTIRELY".
The TypeScript toolchain standard establishes the migration target. Keep
ESLint beside Oxlint until equivalent checks prove the replacement.

## Decision

Run core policy first through `oxlint.config.ts`, with every enabled rule at
error. Resolve the local JS plugin from the config URL so another working
directory uses the same rules. Ignore ESLint disable directives.
Keep `.oxlintrc.json` for anti-slop; it skips `showcase/**` under ADR 0080.
The policy config includes showcase and uses ESLint's six output/vendor ignores.

| Existing rule | Oxlint replacement |
| --- | --- |
| Parameter mutation, nesting depth, public-surface imports | Native `no-param-reassign`, `max-depth`, `no-restricted-imports` |
| Declarative branches, collections and browser globals | Native rules and scopes in [Native declarative lint](0108-native-declarative-lint.md) |
| Five loop selectors, preserving messages and allowing `for await` | JS plugin `policy/no-loops` |
| Literal glob translator fragments in non-test scripts/tooling | JS plugin `policy/no-hand-written-globs` |
| Fourteen repository policy rules | Same JS plugin, enabled in K4 |
| React hooks and twelve Compiler rules | Native React rules in K8 |
| React Doctor rules | Oxlint JS plugin in K9 |
| TS parsing, ignored output, warning failures | Native parsing, ignore patterns, `--deny-warnings` |

### Cannot cover natively

| ESLint rule or policy | Migration decision |
| --- | --- |
| `no-restricted-syntax` | Replace the loop and glob selectors with JS plugin rules in K3. |
| `noInlineConfig` reports directives | Disable ESLint directive handling; the suppression gate rejects directives. K10 waits for that gate. |
| `eslint-env` and `exported` comments | Retire their ESLint interpretation with K10. |
| Compiler `config` and `gating` | Drop in K10 under Ben's approved plan; the app has no Compiler build options or gating directives. |

K3 adds core parity and a single-process fixture harness. K4 enables the
repository plugin; K5 proves slice/import/schema/hook placement; K6 proves
component naming and layout. K7 removes twinned ESLint tests. K8 migrates
React hooks/Compiler and K9 React Doctor. K10 retires ESLint after parity,
then K11 updates the North Star and glossary. Keep ESLint running until K10.

## Consequences

The temporary overlap adds a lint pass while preserving existing checks.
Keep the fixtures at error severity, including directive and nested-config
bypass attempts. Revert this change to restore the previous command.
