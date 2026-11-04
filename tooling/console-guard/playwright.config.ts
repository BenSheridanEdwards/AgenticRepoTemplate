import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import behaviour from '../../playwright.config';

const reference = behaviour.projects?.find(({ name }) => name === 'reference');
if (!reference || !Array.isArray(behaviour.webServer)) {
  throw new Error('Console guard proof needs the reference project and its servers');
}

export default defineConfig({
  ...behaviour,
  // On CI, Playwright's git-info plugin prints a failed git lookup to stdout,
  // which breaks the JSON report the proof parses.
  captureGitInfo: { commit: false, diff: false },
  projects: [{ ...reference, testDir: '.', testMatch: 'guard.cases.ts' }],
  webServer: behaviour.webServer.slice(0, 2).map((server) => ({
    ...server,
    cwd: resolve(fileURLToPath(new URL('../../', import.meta.url)), server.cwd ?? '.'),
    reuseExistingServer: false,
  })),
});
