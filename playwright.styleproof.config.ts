import { defineConfig, devices } from '@playwright/test';

/**
 * StyleProof's capture config (styleproof-map loads it by default). It captures
 * against a production build, because the Vite dev server compiles on first
 * request and its timing varies enough to settle on a loading state in one run
 * and the loaded state in the next.
 *
 * STYLEPROOF_APP_ROOT builds and serves another checkout of the app with this
 * install's toolchain. CI points it at a detached worktree of the PR base, kept
 * under the ignored `.styleproof/` directory so the base sources resolve this
 * checkout's node_modules and nothing is installed at the base commit.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'styleproof.spec.ts',
  timeout: 120_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: {
    command: 'vite build && vite preview --host 127.0.0.1 --port 3000 --strictPort',
    cwd: process.env.STYLEPROOF_APP_ROOT ?? '.',
    url: 'http://127.0.0.1:3000',
    // A server left running from another checkout would be captured as this one.
    reuseExistingServer: false,
    timeout: 600_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
