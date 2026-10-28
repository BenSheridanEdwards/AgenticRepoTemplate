# 52. Playwright screenshot comparisons restore visual regression proof

- **Status:** Accepted
- **Date:** 2026-10-22
- **Supersedes:** ADR 0016 (now deleted)

## Context

Issue #71 requires CI to reject unapproved visual changes. StyleProof's pause
left screenshots to manual review. The software-factory North Star requires an
executable refusal, independent of the agent's judgment. Playwright is already
the browser harness, so its screenshot assertions restore this refusal without
a dependency or a claim that StyleProof's upstream bugs have been fixed.

## Decision

- Playwright `toHaveScreenshot` owns visual regression as the stated fallback.
  Cover the reference greeting's initial, validation and success states at
  1280 and 390 pixels. Showcase visual baselines remain outside this scope.
- `pnpm visual` uses the production reference build and lockfile's Chromium on
  Linux. `updateSnapshots: 'none'` makes absent baselines fail too. CI runs this
  comparison command, with no update flag. Playwright stabilizes screenshots
  and disables animations by default; its default pixel comparison applies.
- Approve intended changes by running `pnpm visual:update` in that environment,
  inspecting the changed PNGs in `apps/web/e2e/__screenshots__/`, committing
  them for human review with the change, and rerunning `pnpm visual`.
- The `Visual regression` workflow uses the existing tested Lighthouse scope
  script. Its inputs include baseline PNGs, the visual spec, Playwright config
  and the visual workflow itself. It compares on UI-relevant PRs and reports
  success without capture on other PRs. Failure artifacts include expected,
  actual and diff screenshots.
- The required-gate contract lists this stand-alone check. A maintainer selects
  it in branch protection. Existing E2E and accessibility gates keep their scope;
  `pnpm visual` is the separate local equivalent of the screenshot lane.

## Consequences

Layout, text, colours and rendering changes can fail CI. PNG diffs make the
approval reviewable. Browser or Linux font changes may require inspected
baseline updates. Local captures on another OS can differ; reproduce the Linux
CI environment before approving. Coverage is limited to the six reference
screens, so reviewers still judge unrepresented states and screenshot proof.
API-only changes do not trigger comparison, even though the success-state
screenshot includes the API's greeting text.

## Location update, 2026-10-27

The six approved PNGs now live beside the visual spec in
`apps/web/e2e/__screenshots__/`. Playwright and the shared Lighthouse/visual
scope rule use that location. File names and baseline bytes are unchanged;
`docs/proof/` remains the location for new PR evidence.
