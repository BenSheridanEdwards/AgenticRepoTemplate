import { expect, test } from '@playwright/test';

/**
 * The end-to-end behaviour map: the contract of what the product DOES, written
 * from the user's point of view. In this template, new behaviour is specified
 * here first — see `.claude/skills/run-e2e-tests/SKILL.md`.
 */
test.describe('Threshold counter', () => {
  test('walks from healthy through warning to at-capacity, then resets', async ({ page }) => {
    await page.goto('/');

    // Scope to the Capacity region: the page now carries a second status region
    // for the service-status feature, so target this feature's live region.
    const status = page.getByRole('region', { name: 'Capacity' }).getByRole('status');
    await expect(status).toHaveText('Healthy');

    const increase = page.getByRole('button', { name: 'Increase' });
    for (let i = 0; i < 4; i += 1) {
      await increase.click();
    }
    await expect(status).toHaveText('Approaching limit');

    for (let i = 0; i < 4; i += 1) {
      await increase.click();
    }
    await expect(status).toHaveText('At capacity');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(status).toHaveText('Healthy');
  });
});
