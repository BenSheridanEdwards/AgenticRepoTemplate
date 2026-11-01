import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';

/**
 * Real-browser accessibility scan. Unlike the jsdom unit check, this runs in
 * Chromium so axe can evaluate computed styles — colour contrast, focus
 * visibility, real roles. A violation fails the push (pre-push) and the merge
 * (CI), so accessibility regressions cannot ship silently.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.describe('Accessibility', () => {
  test('the greeting page has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Greet' })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the validation error state has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a name');

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the greeting result has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Name' }).fill('Ada');
    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByRole('status')).toHaveText('Hello, Ada!');

    expect((await scan(page)).violations).toEqual([]);
  });
});
