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
  projects: [{ ...reference, testDir: '.', testMatch: 'guard.cases.ts' }],
  webServer: behaviour.webServer.slice(0, 2).map((server) => ({
    ...server,
    cwd: resolve(fileURLToPath(new URL('../../', import.meta.url)), server.cwd ?? '.'),
    reuseExistingServer: false,
  })),
});
