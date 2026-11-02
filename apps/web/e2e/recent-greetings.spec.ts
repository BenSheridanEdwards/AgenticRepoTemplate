import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';

test.describe('Recent greetings', () => {
  test('shows the names greeted on the page, newest first', async ({ page }) => {
    const name = `Web-${randomUUID()}`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    const recorded = page.waitForResponse((response) =>
      response.url().includes('/trpc/recentGreetings.record'),
    );
    await page.getByRole('button', { name: 'Greet', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Hello, ${name}!`);
    expect((await recorded).status()).toBe(200);
    const listed = page.waitForResponse((response) =>
      response.url().includes('/trpc/recentGreetings.list'),
    );
    await page.getByRole('button', { name: 'Show recent greetings' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveText(name);
    const body = await (await listed).json();
    const shown = await page.getByRole('listitem').allTextContents();
    expect(shown).toEqual(body[0].result.data.names);
  });

  test('stays closed until asked', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Show recent greetings' })).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);
    expect(requests.filter((url) => url.includes('/trpc/recentGreetings.list'))).toEqual([]);
  });

  test('records each greeted name with surrounding whitespace trimmed', async ({ request }) => {
    const name = `Lin-${randomUUID()}`;
    const recorded = await request.post('/trpc/recentGreetings.record', {
      data: { name: `  ${name}  ` },
    });
    expect(recorded.status()).toBe(200);
    const response = await request.get('/trpc/recentGreetings.list');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { data: { names: expect.arrayContaining([name]) } },
    });
  });

  test('lists the newest name first and keeps at most ten names', async ({ request }) => {
    const prefix = randomUUID();
    const names = Array.from({ length: 12 }, (_, index) => `${prefix}-${index}`);
    await names.reduce(async (previous, name) => {
      await previous;
      const response = await request.post('/trpc/recentGreetings.record', { data: { name } });
      expect(response.status()).toBe(200);
    }, Promise.resolve());
    const response = await request.get('/trpc/recentGreetings.list');
    expect(response.status()).toBe(200);
    const body = await response.json();
    const recent: string[] = body.result.data.names;
    expect(recent).toHaveLength(10);
    const ownNames = recent.filter((name) => name.startsWith(prefix));
    expect(ownNames.length).toBeGreaterThanOrEqual(2);
    expect(ownNames).toEqual([...names].reverse().filter((name) => ownNames.includes(name)));
    expect(recent).not.toContain(names[0]);
    expect(recent).not.toContain(names[1]);
  });

  test('rejects a blank recent greeting name as a bad request', async ({ request }) => {
    const response = await request.post('/trpc/recentGreetings.record', { data: { name: '   ' } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { data: { code: 'BAD_REQUEST' } } });
  });
});
