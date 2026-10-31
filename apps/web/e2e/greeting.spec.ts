import { expect, type Page, test } from './fixtures';

/**
 * The greeting behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process.
 */
async function submitName(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('button', { name: 'Greet' }).click();
}

test.describe('Greeting', () => {
  test('greets a name through the api', async ({ page }) => {
    const answered = page.waitForResponse((response) =>
      response.url().includes('/trpc/greeting.greet'),
    );

    await submitName(page, '  Ada ');

    expect((await answered).status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText('Hello, Ada!');
  });

  test('asks for a name and sends no request when the name is blank', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/trpc')) {
        apiCalls.push(request.url());
      }
    });

    await submitName(page, '   ');

    await expect(page.getByRole('alert')).toHaveText('Enter a name');
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByRole('status')).toHaveText('');
    expect(apiCalls).toEqual([]);
  });

  test('the api rejects a blank name as a bad request', async ({ request }) => {
    const input = encodeURIComponent(JSON.stringify({ name: '   ' }));

    const response = await request.get(`/trpc/greeting.greet?input=${input}`);

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { data: { code: 'BAD_REQUEST' } } });
  });

  test('says so when the api fails', async ({ page, expectConsole }) => {
    expectConsole(/Failed to load resource: .*500/);
    await page.route('**/trpc/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await submitName(page, 'Ada');

    await expect(page.getByRole('alert')).toHaveText('Could not load the greeting');
  });
});
