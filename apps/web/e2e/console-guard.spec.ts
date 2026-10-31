import { test } from './fixtures';

test('a page console warning fails the test', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.evaluate(() => console.warn('x'));
});

test('a page console error fails the test', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.evaluate(() => console.error('x'));
});

test('an uncaught page error fails the test', async ({ page }) => {
  test.fail();
  await page.goto('/');
  const error = page.waitForEvent('pageerror');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('x');
    }, 0);
  });
  await error;
});

test.describe('expected console messages', () => {
  test.use({ expectedConsole: [/expected error/] });

  test('a missing expected message fails the test', async ({ page }) => {
    test.fail();
    await page.goto('/');
  });

  test('a declared expected error passes', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => console.error('expected error'));
  });
});
