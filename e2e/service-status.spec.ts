import { expect, test } from '@playwright/test';

/**
 * Behaviour map for the service-status feature. The product fetches its data
 * over the network, so each test intercepts that request at the network
 * boundary (`page.route`) and drives one journey deterministically, then
 * asserts through roles and visible text, never through implementation detail.
 * See `.claude/skills/run-e2e-tests/SKILL.md`.
 */
const ENDPOINT = '**/api/service-status';

test.describe('Service status', () => {
  test('shows loading, then lists each service when the request succeeds', async ({ page }) => {
    // Hold the response open so the loading state is observable, then release it.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(ENDPOINT, async (route) => {
      await held;
      await route.fulfill({
        json: [
          { identifier: 'web', name: 'Web application', health: 'operational' },
          { identifier: 'api', name: 'Public API', health: 'degraded' },
        ],
      });
    });

    await page.goto('/');
    const region = page.getByRole('status').filter({ hasText: 'service status' });
    await expect(region).toContainText('Loading service status');

    release();
    await expect(page.getByText('Web application')).toBeVisible();
    await expect(page.getByText('Operational')).toBeVisible();
    await expect(page.getByText('Public API')).toBeVisible();
    await expect(page.getByText('Degraded')).toBeVisible();
  });

  test('shows an error message when the request fails', async ({ page }) => {
    await page.route(ENDPOINT, (route) => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/');

    await expect(page.getByText('Could not load service status')).toBeVisible();
  });

  test('shows an empty message when no services are monitored', async ({ page }) => {
    await page.route(ENDPOINT, (route) => route.fulfill({ json: [] }));

    await page.goto('/');

    await expect(page.getByText('No services are being monitored yet')).toBeVisible();
  });

  test('recovers from error to success when the user refreshes', async ({ page }) => {
    // The test owns the response mode explicitly rather than counting requests:
    // React StrictMode can fetch twice on mount, so request counting is unsafe.
    let shouldFail = true;
    await page.route(ENDPOINT, (route) => {
      if (shouldFail) {
        return route.fulfill({ status: 500, body: 'boom' });
      }
      return route.fulfill({
        json: [{ identifier: 'web', name: 'Web application', health: 'operational' }],
      });
    });

    await page.goto('/');
    await expect(page.getByText('Could not load service status')).toBeVisible();

    shouldFail = false;
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Web application')).toBeVisible();
  });
});
