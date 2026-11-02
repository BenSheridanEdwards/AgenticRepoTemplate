import { test } from '../../apps/web/e2e/fixtures';

const messages = [
  { method: 'warning', emit: () => console.warn('x') },
  { method: 'error', emit: () => console.error('x') },
];

messages.forEach(({ method, emit }) => {
  test(`console.${method}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(emit);
  });
});

test('pageerror', async ({ page }) => {
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

  test('missing expected message', async ({ page }) => {
    await page.goto('/');
  });

  test('declared expected error', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => console.error('expected error'));
  });
});
