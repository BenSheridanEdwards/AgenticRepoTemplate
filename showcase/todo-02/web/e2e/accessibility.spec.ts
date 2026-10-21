import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * Real-browser accessibility scan. Runs in Chromium so axe can evaluate
 * computed styles — colour contrast, focus visibility, real roles. A violation
 * fails the push (pre-push) and the merge (CI).
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.describe('Accessibility', () => {
  test('the empty todos page has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the validation error state has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('a listed todo has no detectable WCAG A/AA violations', async ({ page }) => {
    const title = `Read a book ${randomUUID().slice(0, 8)}`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });
});
