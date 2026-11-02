import { test } from './fixtures';

test.describe('expected console messages', () => {
  test.use({ expectedConsole: [/expected error/] });

  test('a declared expected error passes', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => console.error('expected error'));
  });
});
