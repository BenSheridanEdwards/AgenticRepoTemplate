# Reference visual baselines

These six approved Linux Chromium screenshots are inputs to
`apps/web/e2e/visual.spec.ts`. They cover initial, validation and successful
greeting states at desktop (1280 × 720) and mobile (390 × 844) viewports.

Run `pnpm e2e:install`, then `pnpm visual`. To propose an intended visual
change, run `pnpm visual:update` on Linux, inspect every changed PNG, commit
those baselines with the UI change for human review, and rerun `pnpm visual`.
The CI command compares only. Its `visual-differences` artifact contains the
expected, actual and diff images on a failure.

## Seeded regression experiment

The same commands used by CI were exercised locally against the production
build. The temporary source and baseline changes were restored afterwards:

| Change | Command | Result |
| --- | --- | --- |
| Change `.ui-button` background from `#1d263f` to `#ff0000` | `pnpm visual` | Failed (exit 1), both viewport tests detected screenshot differences. |
| Propose baselines for the red button | `pnpm visual:update` | Passed (exit 0), changed PNG baselines. |
| Compare against those updated baselines | `pnpm visual` | Passed (exit 0), both viewport tests. |
| Restore original CSS and original baselines | `pnpm visual` | Passed (exit 0), both viewport tests. |

`pnpm exec jest scripts/lighthouse-scope.test.ts --runInBand` proves the shared
scope rule excludes docs-only changes and includes shipped UI changes.
`scripts/required-gates.test.ts` seeds workflow bypasses and proves the gate
contract rejects skipped comparisons, ignored failures and replaced scope
commands. Hosted results are recorded separately in the PR; the seeded
experiment above is local proof.
