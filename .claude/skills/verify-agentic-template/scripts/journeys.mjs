/**
 * The journeys `verify.mjs drive <id>` runs. Each one follows the matching
 * feature file in `../features/`. A journey receives `{ page, step, expect }`;
 * every `step` captures a screenshot and an ARIA snapshot after its body passes.
 */
import AxeBuilder from '@axe-core/playwright';

const capacity = {
  id: 'capacity',
  feature: 'capacity',
  async run({ page, step, expect }) {
    const region = page.getByRole('region', { name: 'Capacity' });
    const status = region.getByRole('status');
    const press = async (name, times) => {
      for (let index = 0; index < times; index += 1) {
        await region.getByRole('button', { name }).click();
      }
    };

    await step('open the page healthy at zero', async () => {
      await page.goto('/');
      await expect(status).toHaveText('Healthy');
      await expect(region).toContainText('0/ 8');
    });
    await step('decrease at zero stays at zero', async () => {
      await press('Decrease', 1);
      await expect(region).toContainText('0/ 8');
      await expect(status).toHaveText('Healthy');
    });
    await step('four increases reach approaching limit', async () => {
      await press('Increase', 4);
      await expect(region).toContainText('4/ 8');
      await expect(status).toHaveText('Approaching limit');
    });
    await step('four more increases reach at capacity', async () => {
      await press('Increase', 4);
      await expect(region).toContainText('8/ 8');
      await expect(status).toHaveText('At capacity');
    });
    await step('one decrease drops back to approaching limit', async () => {
      await press('Decrease', 1);
      await expect(region).toContainText('7/ 8');
      await expect(status).toHaveText('Approaching limit');
    });
    await step('keyboard enter on increase adds one', async () => {
      await region.getByRole('button', { name: 'Increase' }).focus();
      await page.keyboard.press('Enter');
      await expect(region).toContainText('8/ 8');
      await expect(status).toHaveText('At capacity');
    });
    await step('reset returns to healthy at zero', async () => {
      await press('Reset', 1);
      await expect(region).toContainText('0/ 8');
      await expect(status).toHaveText('Healthy');
    });
  },
};

const serviceStatus = {
  id: 'service-status',
  feature: 'service-status',
  async run({ page, step, expect }) {
    const region = page.getByRole('region', { name: 'Service status' });
    const apiCalls = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/service-status') {
        apiCalls.push(request.url());
      }
    });

    await step('the live list shows every service with its health', async () => {
      await page.goto('/');
      const items = region.getByRole('listitem');
      await expect(items).toHaveCount(3);
      await expect(items.nth(0)).toHaveText(/Web application\s*Operational/);
      await expect(items.nth(1)).toHaveText(/Public API\s*Degraded/);
      await expect(items.nth(2)).toHaveText(/Background jobs\s*Down/);
    });
    await step('refresh requests the API again and keeps the list', async () => {
      const before = apiCalls.length;
      await region.getByRole('button', { name: 'Refresh' }).click();
      await expect.poll(() => apiCalls.length).toBeGreaterThan(before);
      await expect(region.getByRole('listitem')).toHaveCount(3);
    });
  },
};

const serviceStatusStates = {
  id: 'service-status-states',
  feature: 'service-status',
  async run({ page, step, expect }) {
    const region = page.getByRole('region', { name: 'Service status' });
    let mode = 'hold';
    let release = () => undefined;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/api/service-status', async (route) => {
      if (mode === 'hold') {
        await held;
        return route.fulfill({ json: [] });
      }
      if (mode === 'error') {
        return route.fulfill({ status: 500, body: 'unavailable' });
      }
      return route.continue();
    });

    await step('loading shows while the API is pending', async () => {
      await page.goto('/');
      await expect(region.getByRole('status')).toHaveText('Loading service status…');
    });
    await step('an empty answer shows the empty message', async () => {
      release();
      await expect(region).toContainText('No services are being monitored yet.');
    });
    await step('a failing API shows the error message', async () => {
      mode = 'error';
      await region.getByRole('button', { name: 'Refresh' }).click();
      await expect(region).toContainText(
        'Could not load service status. Service status request failed with HTTP 500',
      );
    });
    await step('refresh after recovery shows the live list', async () => {
      mode = 'live';
      await region.getByRole('button', { name: 'Refresh' }).click();
      await expect(region.getByRole('listitem')).toHaveCount(3);
    });
  },
};

const accessibility = {
  id: 'accessibility',
  feature: 'accessibility',
  async run({ page, step, expect }) {
    await step('the landing page has no WCAG A or AA violations', async () => {
      await page.goto('/');
      await expect(
        page.getByRole('region', { name: 'Service status' }).getByRole('listitem'),
      ).toHaveCount(3);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
    });
    await step('keyboard tab order reaches every button by name', async () => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
      const names = [];
      for (let index = 0; index < 4; index += 1) {
        await page.keyboard.press('Tab');
        names.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
      }
      expect(names).toEqual(['Decrease', 'Increase', 'Reset', 'Refresh']);
    });
  },
};

export const JOURNEYS = Object.fromEntries(
  [capacity, serviceStatus, serviceStatusStates, accessibility].map((journey) => [
    journey.id,
    journey,
  ]),
);
