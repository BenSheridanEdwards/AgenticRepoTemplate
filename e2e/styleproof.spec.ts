import { defineStyleMapCapture } from 'styleproof';

/**
 * StyleProof reads the browser's *computed* styles for each surface and diffs
 * the PR head against its base branch — catching CSS regressions that pixel
 * snapshots miss (forced :hover/:focus, between-breakpoint rules, sub-pixel
 * drift). It is inert until STYLEMAP_DIR is set, so it lives safely beside the
 * behaviour specs and only runs inside `.github/workflows/styleproof.yml`.
 */
defineStyleMapCapture({
  dir: process.env.STYLEMAP_DIR,
  surfaces: [
    {
      key: 'threshold-counter',
      go: async (page) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
      },
      // One viewport per @media band declared in src/index.css.
      widths: [1280, 768, 390],
    },
    // The service-status feature has distinct visual states, so each terminal
    // state is its own surface. The request is intercepted at the network
    // boundary to make the captured state deterministic.
    {
      key: 'service-status-success',
      go: async (page) => {
        await page.route('**/api/service-status', (route) =>
          route.fulfill({
            json: [
              { identifier: 'web', name: 'Web application', health: 'operational' },
              { identifier: 'api', name: 'Public API', health: 'degraded' },
              { identifier: 'jobs', name: 'Background jobs', health: 'down' },
            ],
          }),
        );
        await page.goto('/');
        await page.getByText('Web application').waitFor();
      },
      widths: [1280, 768, 390],
    },
    {
      key: 'service-status-empty',
      go: async (page) => {
        await page.route('**/api/service-status', (route) => route.fulfill({ json: [] }));
        await page.goto('/');
        await page.getByText('No services are being monitored yet').waitFor();
      },
      widths: [1280, 768, 390],
    },
    {
      key: 'service-status-error',
      go: async (page) => {
        await page.route('**/api/service-status', (route) =>
          route.fulfill({ status: 500, body: 'boom' }),
        );
        await page.goto('/');
        await page.getByText('Could not load service status').waitFor();
      },
      widths: [1280, 768, 390],
    },
  ],
});
