# Snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Ecosystem: node
- Package manager: pnpm (`pnpm@11.3.0`, `pnpm-lock.yaml`, `.npmrc`)
- Hook runner: husky (`.husky/` + `prepare: husky`)
- Graphify output present: no (static-only audit — reduced context)
- Generated: 2026-06-17T00:00:00Z

## Posture in one line

Strong, honest pre-commit and CI posture for a frontend template — but the
opinionated baseline is graded strictly: staged-file gates use `biome check
--staged` directly instead of `lint-staged`, the staged type check runs over
the whole project rather than staged files, pre-push omits type-check / full
lint / build smoke, and CI has no bundle-size budget, no automated
accessibility check, no license-compliance check, and no Lighthouse CI.

## Status tally

| Stage | Present | Misconfigured | Missing |
| --- | --- | --- | --- |
| Pre-commit | 2 | 3 | 1 |
| Pre-push | 2 | 0 | 3 |
| Continuous integration | 5 | 0 | 4 |
