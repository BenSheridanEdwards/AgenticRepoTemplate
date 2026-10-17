import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import { listResults } from './tooling/results.mjs';

/**
 * Playwright is the browser harness for the behaviour map. Each result
 * (`apps/`, then every `showcase/<id>/`) gets one Chromium project that runs
 * every spec in `<result>/web/e2e/`, and two servers: its api on Node and its
 * web app on the Vite dev server, which proxies `/trpc` to that api. Each
 * showcase result also gets `<id>-acceptance`, which runs the fixed Todo
 * acceptance spec in `tooling/trial/acceptance/` against the same servers
 * (ADR 0034).
 *
 * `E2E_BASE_URL` points the reference project at a web server you manage
 * yourself, such as the built preview on :3000, which proxies `/trpc` to the
 * api on :3001 that Playwright still starts.
 */
const externalBaseUrl = process.env.E2E_BASE_URL;
const reuseExistingServer = !process.env.CI;
const results = listResults(import.meta.dirname);

type WebServer = Extract<PlaywrightTestConfig['webServer'], readonly unknown[]>[number];

const webUrl = (port: number) => `http://127.0.0.1:${port}`;
const usesExternalServer = (id: string) => id === 'reference' && Boolean(externalBaseUrl);

export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    ...results.map(({ id, web, ports }) => ({
      name: id,
      testDir: `./${web}/e2e`,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: usesExternalServer(id) ? externalBaseUrl : webUrl(ports.web),
      },
    })),
    ...results
      .filter(({ id }) => id !== 'reference')
      .map(({ id, ports }) => ({
        name: `${id}-acceptance`,
        testDir: './tooling/trial/acceptance',
        use: { ...devices['Desktop Chrome'], baseURL: webUrl(ports.web) },
      })),
  ],
  webServer: results.flatMap(({ id, web, api, ports }): WebServer[] => [
    {
      command: `node ${api}/src/server.ts`,
      env: { PORT: String(ports.api) },
      port: ports.api,
      reuseExistingServer,
      timeout: 60_000,
    },
    ...(usesExternalServer(id)
      ? []
      : [
          {
            command: `pnpm exec vite --host 127.0.0.1 --port ${ports.web} --strictPort`,
            cwd: web,
            env: { API_ORIGIN: webUrl(ports.api) },
            url: webUrl(ports.web),
            reuseExistingServer,
            timeout: 120_000,
          },
        ]),
  ]),
});
