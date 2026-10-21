import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Real-browser accessibility scan. Running in Chromium lets axe evaluate
 * computed styles — colour contrast, focus visibility, real roles — which the
 * jsdom unit check cannot. A violation fails the push and the merge.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.describe('Accessibility', () => {
  test('the empty todo page has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the todo page with a todo listed has no detectable WCAG A/AA violations', async ({
    page,
  }) => {
    const title = `Read a book ${randomUUID().slice(0, 8)}`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });
});
