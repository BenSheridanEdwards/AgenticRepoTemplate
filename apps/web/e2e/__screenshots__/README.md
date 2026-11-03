# Visual baselines

These are the six Linux Chromium baselines for `../visual.spec.ts`.
To update on Linux, run `pnpm e2e:install`, then `pnpm visual:update`.
Inspect every changed PNG, commit it with the UI change, and rerun `pnpm visual`.
CI only compares and uploads `visual-differences` on a failure.

Last refresh: Playwright 1.61.0 with its pinned Chromium headless shell, for the Tailwind restyle on the `@repo/ui` tokens (ADR 0111). These six images were captured on a Debian 13 x86_64 box, not on the hosted runner. That box set `FONTCONFIG_FILE` to a hand-written fontconfig file that loads only the DejaVu and Liberation font folders, prefers DejaVu Sans for `sans-serif`, and includes the system hinting and antialiasing rules. Under that setup the previous baselines still differed by 24 glyph pixels. Those previous baselines came from arm64 Ubuntu 24.04 and pass on the hosted runner, so the box, not the CPU, explains the gap. The hosted `Visual regression` job is the judge. If it fails, download its `visual-differences` artifact, inspect each `*-actual.png`, and commit those runner images as the baselines.
For low-memory capture, build and run the production preview separately on port 5173, then update and compare:
```sh
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --update-snapshots --workers=1
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --workers=1
```
