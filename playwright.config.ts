import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import { listResults } from './tooling/results.mjs';

/**
 * Playwright is the browser harness for the behaviour map. Each result
 * (`apps/`, then every `showcase/<id>/`) gets one Chromium project that runs
 * every spec in `<result>/web/e2e/`, and two servers: its api on Node and its
 * web app on Vite, which proxies `/trpc` to that api. Each showcase result also
 * gets `<id>-acceptance`, which runs the fixed acceptance spec of its brief in
 * `tooling/trial/acceptance/` against the same servers (ADR 0034).
 *
 * The reference's web server runs the production build (`vite build` then
 * `vite preview`, which serves `dist/` and proxies `/trpc` the same way the dev
 * server does) rather than the dev server when `E2E_BUILD` is set to anything
 * other than `0`/`false`, and by default under `CI`. This proves the shipping
 * bundle — bundling, env, base paths and the preview `/trpc` proxy — end to
 * end on every CI run. Local runs
 * default to the fast dev server; set `E2E_BUILD=1` to rehearse the build
 * locally, or `E2E_BUILD=0` to force the dev server in CI. The showcase results
 * stay on the dev server: they are frozen trial evidence (ADR 0034), not the
 * shipping product. `E2E_BASE_URL` still points the reference at a preview you
 * manage yourself (it wins over `E2E_BUILD`), with the api on :3001 that
 * Playwright starts.
 */
// Set E2E_BASE_URL=http://localhost:3000 to use a web server you manage yourself,
// for example the built preview from `pnpm preview`, instead of starting Vite.
const externalBaseUrl = process.env.E2E_BASE_URL;
const reuseExistingServer = !process.env.CI;
const productionBuild =
  process.env.E2E_BUILD === undefined
    ? Boolean(process.env.CI)
    : process.env.E2E_BUILD !== '0' && process.env.E2E_BUILD !== 'false';
const visual = process.env.VISUAL === '1';
const results = listResults(import.meta.dirname).filter(({ id }) => !visual || id === 'reference');

type WebServer = Extract<PlaywrightTestConfig['webServer'], readonly unknown[]>[number];

const webUrl = (port: number) => `http://127.0.0.1:${port}`;
const usesExternalServer = (id: string) => id === 'reference' && Boolean(externalBaseUrl);
const usesProductionBuild = (id: string) =>
  id === 'reference' && productionBuild && !externalBaseUrl;

export default defineConfig({
  fullyParallel: true,
  testMatch: visual ? '**/visual.spec.ts' : '**/*.spec.ts',
  testIgnore: visual ? [] : ['**/visual.spec.ts'],
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/../../../docs/proof/visual-regression/{arg}{ext}',
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
        testMatch: /^notes(?:-codex)?-\d+$/.test(id) ? 'notes.spec.ts' : 'todo.spec.ts',
        use: { ...devices['Desktop Chrome'], baseURL: webUrl(ports.web) },
      })),
  ],
  webServer: results.flatMap(({ id, web, api, ports }): WebServer[] => {
    const apiServer: WebServer = {
      command: `node ${api}/src/server.ts`,
      env: { PORT: String(ports.api) },
      port: ports.api,
      reuseExistingServer,
      timeout: 60_000,
    };
    if (usesExternalServer(id)) {
      return [apiServer];
    }
    // The built web server never reuses an existing server, so a busy port
    // fails explicitly in managed production mode rather than silently serving
    // a stray dev server and skipping the build; the dev server keeps
    // `reuseExistingServer` (api and showcase are unchanged).
    const webServer: WebServer = usesProductionBuild(id)
      ? {
          command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${ports.web} --strictPort`,
          cwd: web,
          env: { API_ORIGIN: webUrl(ports.api) },
          url: webUrl(ports.web),
          reuseExistingServer: false,
          timeout: 180_000,
        }
      : {
          command: `pnpm exec vite --host 127.0.0.1 --port ${ports.web} --strictPort`,
          cwd: web,
          env: { API_ORIGIN: webUrl(ports.api) },
          url: webUrl(ports.web),
          reuseExistingServer,
          timeout: 120_000,
        };
    return [apiServer, webServer];
  }),
});
