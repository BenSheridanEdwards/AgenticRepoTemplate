# Visual baselines

These are the six Linux Chromium baselines for `../visual.spec.ts`.
To update on Linux, run `pnpm e2e:install`, then `pnpm visual:update`.
Inspect every changed PNG, commit it with the UI change, and rerun `pnpm visual`.
CI only compares and uploads `visual-differences` on a failure.

Last refresh: Playwright 1.61.0 with Chromium 149.0.7827.55 on x86-64 Debian 13, with Fontconfig `rgba=rgb` to match the Ubuntu 24.04 runner. The two initial PNGs matched CI run 39787273847 byte for byte.
For low-memory capture, build and run the production preview separately on port 5173, then update and compare:
```sh
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --update-snapshots --workers=1
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --workers=1
```
