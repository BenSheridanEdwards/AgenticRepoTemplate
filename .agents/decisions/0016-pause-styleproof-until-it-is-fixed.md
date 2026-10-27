# 16. Pause StyleProof until it is fixed

- **Status:** Superseded by [0052](0052-playwright-visual-regression.md) and [0063](0063-styleproof-checks-the-component-gallery-only.md)
- **Date:** 2026-10-16

## Context

StyleProof owned computed-style visual regressions through two CI workflows,
a capture spec, and its configs. The tool needs fixes upstream before it can
gate pull requests reliably again.

## Decision

- **StyleProof is removed for now.** Its workflows, configs, capture spec,
  surface template, package dependency, and references leave the repo in one
  change.
- **Playwright, axe, Lighthouse, and screenshot proof in the PR body** carry
  UI review in the meantime.
- **Visual style checking returns once StyleProof is fixed**, through a new ADR
  that restores it as the visual gate.

## Consequences

- PRs report one fewer status, and reviewers check UI changes through
  screenshots and video in the PR body.
- `vendor/extract-zip` stays, because Lighthouse CI depends on it through
  `@puppeteer/browsers`.
- ADRs 0002, 0003, and 0008 now describe the gate set without StyleProof.
