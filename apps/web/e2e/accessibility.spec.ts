import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Real-browser accessibility scan. Unlike the jsdom unit check, this runs in
 * Chromium so axe can evaluate computed styles — colour contrast, focus
 * visibility, real roles. A violation fails the push (pre-push) and the merge
 * (CI), so accessibility regressions cannot ship silently.
 */
test.describe('Accessibility', () => {
  test('the landing page has no detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
