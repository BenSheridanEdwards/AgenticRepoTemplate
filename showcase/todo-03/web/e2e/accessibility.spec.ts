import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Real-browser accessibility scan. Unlike the jsdom unit check, this runs in
 * Chromium so axe can evaluate computed styles: colour contrast, focus
 * visibility, real roles.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.describe('Accessibility', () => {
  test('the todos page has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Todos' })).toBeAttached();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the validation error state has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');

    expect((await scan(page)).violations).toEqual([]);
  });

  test('a completed todo has no detectable WCAG A/AA violations', async ({ page }) => {
    const title = `Read a book ${crypto.randomUUID().slice(0, 8)}`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    expect((await scan(page)).violations).toEqual([]);
  });
});
