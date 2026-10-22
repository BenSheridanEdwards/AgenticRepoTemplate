# Reference visual baselines

These six approved Linux Chromium screenshots are inputs to
`apps/web/e2e/visual.spec.ts`. They cover initial, validation and successful
greeting states at desktop (1280 × 720) and mobile (390 × 844) viewports.

Run `pnpm e2e:install`, then `pnpm visual`. To propose an intended visual
change, run `pnpm visual:update` on Linux, inspect every changed PNG, commit
those baselines with the UI change for human review, and rerun `pnpm visual`.
The CI command compares only. Its `visual-differences` artifact contains the
expected, actual and diff images on a failure.

## Linux baseline refresh

The six PNGs were regenerated with Playwright 1.61.0 and its Chromium
149.0.7827.55 on x86-64 Debian 13, with Fontconfig `rgba=rgb` to match the
Ubuntu 24.04 CI runner. Both initial PNGs are byte-identical to the actual
images in [CI run 39787273847](https://github.com/BenSheridanEdwards/AgenticRepoTemplate/actions/runs/39787273847):

| Initial baseline | SHA-256 |
| --- | --- |
| `greeting-1280-initial.png` | `52c7103c493937ae458ae6ea166a827a917d56b351bb6badc50eaea3e5fcd28f` |
| `greeting-390-initial.png` | `840eedca3146cf4110db2ad3a6a32c54f8e7048e1dd3cef7373393b9c959c72a` |

To fit the capture sandbox's memory, the production reference build and Vite
preview ran separately. With Node 22 on `PATH` and that preview on port 5173,
the unchanged spec captured every state through the real API:

```sh
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --update-snapshots --workers=1
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --workers=1
```

The update and comparison each passed both viewport journeys. Hosted validation
of the refreshed baselines is recorded separately in the PR.

## Seeded regression experiment

The earlier macOS experiment proved comparison mechanics against the production
build; it did not establish Linux baseline compatibility. The temporary source
and baseline changes were restored afterwards:

| Change | Command | Result |
| --- | --- | --- |
| Change `.ui-button` background from `#1d263f` to `#ff0000` | `pnpm visual` | Failed (exit 1), both viewport tests detected screenshot differences. |
| Propose baselines for the red button | `pnpm visual:update` | Passed (exit 0), changed PNG baselines. |
| Compare against those updated baselines | `pnpm visual` | Passed (exit 0), both viewport tests. |
| Restore original CSS and original baselines | `pnpm visual` | Passed (exit 0), both viewport tests. |

`pnpm exec jest scripts/lighthouse-scope.test.ts --runInBand` proves the shared
scope rule excludes docs-only changes and includes shipped UI changes, baseline
PNGs, the visual spec, Playwright config and the visual workflow.
`scripts/required-gates.test.ts` seeds workflow bypasses and proves the gate
contract rejects skipped comparisons, ignored failures and replaced scope
commands. Hosted results are recorded separately in the PR; the seeded
experiment above is local proof.
