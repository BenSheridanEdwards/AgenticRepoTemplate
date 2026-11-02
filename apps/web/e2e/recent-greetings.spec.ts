import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';

test.describe('Recent greetings', () => {
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
