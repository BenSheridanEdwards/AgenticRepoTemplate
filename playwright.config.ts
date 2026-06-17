import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright is the single browser harness for two jobs:
 *   1. `e2e/app.spec.ts`        — the behaviour map (what the product must do).
 *   2. `e2e/styleproof.spec.ts` — StyleProof's computed-style capture.
 *
 * `E2E_BASE_URL` lets CI point the run at a server it manages itself (the
 * StyleProof workflow builds + serves on :3000). When it is unset we boot the
 * Vite dev server for fast local pre-push runs.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const usesExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: usesExternalServer
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
