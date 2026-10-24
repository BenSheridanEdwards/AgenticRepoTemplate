import { defineConfig, devices } from '@playwright/test';

// Serve only the production component gallery harness (ADR 0063).
export default defineConfig({
  testDir: './apps/web/e2e/styleproof',
  testMatch: 'gallery.capture.ts',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command:
      'pnpm exec vite build --config vite.config.ts e2e/styleproof && pnpm exec vite preview --config vite.config.ts e2e/styleproof --host 127.0.0.1 --port 3100 --strictPort',
    cwd: 'apps/web',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
