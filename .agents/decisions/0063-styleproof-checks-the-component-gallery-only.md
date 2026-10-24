# 63. StyleProof checks the component gallery only

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-24
- **Builds on:** [0052](0052-playwright-visual-regression.md)
- **Completes:** [0016](0016-pause-styleproof-until-it-is-fixed.md)

## Context

ADR 0016 paused StyleProof, and ADR 0052 restored a blocking pixel comparison
through Playwright. StyleProof 8.x's default crawl walks application routes;
Ben wants a complete StyleProof run to take under five minutes. The shared UI
kit currently has Button and TextField. A static gallery of each component in
its states gives computed-style review a small, explicit inventory, serving
the component-library role that Storybook would otherwise fill. Storybook is
absent from this repository.

## Decision

- Add `styleproof` 8.0.1 as an exactly pinned development dependency. Capture
  only `apps/web/e2e/styleproof/`, using `defineStyleMapCapture` and
  `componentCatalogSurfaces`: one surface per component discovered under
  `packages/ui/src`, at 1280 and 390 pixels. The `expected` inventory comes
  from `discoverComponentFiles`. Each surface also asserts that its matching
  gallery section is visible, so a new component must appear in the gallery
  before capture passes.
- The gallery renders Button's default, submit, disabled and long-label
  states, and TextField's empty, populated, placeholder, disabled and error
  states. StyleProof captures forced hover, focus and active states too.
- Keep route traversal off. `defineCrawlCapture` and `styleproof crawl` belong
  to the future direction below. The capture spec names only gallery surfaces.
- Type-check the root config with `satisfies StyleProofConfig` and a type-only
  import. Loading both revisions' configs then leaves Playwright runtime loading
  to the capture process; the runtime helper imports a second Playwright copy
  in StyleProof 8.0.1's pnpm cold-base path.
- One `pull_request` workflow captures the base and head with
  `styleproof-ci --no-store`. It runs on UI-kit, token, harness, Vite config,
  manifest, lockfile, StyleProof config and workflow changes. On first adoption,
  `--spec-ref-if-missing` overlays the head's colocated gallery harness and
  capture config onto the base, while the base's components and tokens remain
  pinned to the base revision.
- Set `pnpm_config_ignore_workspace_root_check=true` and
  `pnpm_config_minimum_release_age=0` for the capture command. These settings
  let StyleProof's first-adoption install add its exact version at the
  temporary base workspace root under pnpm 11; they leave the repository's
  normal install policy unchanged. Run local comparisons in a disposable
  checkout with independent Git metadata, since `styleproof-ci` prunes
  worktree registrations during cleanup.
- Pin the StyleProof Action to the v8.0.1 commit
  `8b702f76dfcf38d4438fe76c16daeb8dc61f315c` and use `mode: advisory` with
  `report-storage: artifact`. The PR report and artifact show before/after
  crops and computed-property changes for each changed element. Failed
  captures and degraded baselines still fail the job.
- Keep StyleProof advisory and outside the required-check contract. Ben
  authors the PRs, and StyleProof's approval workflow refuses self-approval,
  so this integration uses reporting alone. ADR 0052's `Visual regression`
  remains the blocking visual gate.

## Future direction

Route traversal is handed off in [TODO](../TODO.md#styleproof-route-traversal-future).
Consider `defineCrawlCapture({ from: '/' })` or explicit application-route
surfaces once a complete capture of the reference app and showcase results
fits the five-minute budget and upstream reliability is demonstrated. A later
ADR records the scope and evidence for enabling it; this gallery integration
is complete independently of that work.

## Consequences

Component styles, shared tokens and interaction-state changes are shown side
by side on PRs. Route-level layout outside the gallery continues to rely on
ADR 0052's screenshots. Each new UI component needs gallery states before its
capture can pass. The harness stays separate from the application's routes
and from the ordinary E2E spec selection.

The final-config first-adoption capture completed in **36.86 wall seconds**
on 2026-10-24, below the 300-second target. It compared base
`ac05e811d7b4776909e222bdb078ed57b65eb22d` with head
`2148a11950aca70c9488cd6a79b650eacda6067b` in an isolated disposable checkout.
Each side captured two components at two widths plus two metadata checks.
The machine's `uptime` load averages (1, 5 and 15 minutes) were
**20.74, 34.10, 34.62** before and **15.24, 31.24, 33.55** after. A separate
intentional Button background change completed in **60.51 seconds** and
produced side-by-side crops with four findings across the two Button widths.
The temporary style change was removed after saving the screenshot proof.
CI job timing is pending and will be recorded in the PR evidence. When
rendering a report from explicit capture directories, pass
`--expected-before-sha` and `--expected-after-sha` to bind the comparison to
those revisions.
