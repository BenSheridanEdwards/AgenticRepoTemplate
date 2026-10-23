import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process. The tests share one api, so each
 * makes its own titles.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const todoList = (page: Page) => page.getByRole('list', { name: 'Todos' });

async function addTodo(page: Page, title: string) {
  const saved = page.waitForResponse((response) => response.url().includes('/trpc/todos.create'));
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await saved).status()).toBe(200);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Todos', () => {
  test('adds a todo with the trimmed title, unchecked, and clears the field', async ({ page }) => {
    const title = newTitle('Buy milk');

    await addTodo(page, `  ${title} `);

    await expect(
      todoList(page).getByRole('checkbox', { name: title, exact: true }),
    ).not.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  test('asks for a title and sends no request when the title is blank', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/trpc')) {
        apiCalls.push(request.url());
      }
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(apiCalls).toEqual([]);
  });

  test('toggles a todo complete and keeps it across a reload', async ({ page }) => {
    const title = newTitle('Walk the dog');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });

    const saved = page.waitForResponse((response) => response.url().includes('/trpc/todos.toggle'));
    await checkbox.click();
    await saved;

    await expect(checkbox).toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();
  });

  test('deletes a todo and it stays gone after a reload', async ({ page }) => {
    const title = newTitle('Water the plants');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });
    await expect(checkbox).toBeVisible();

    const deleted = page.waitForResponse((response) =>
      response.url().includes('/trpc/todos.delete'),
    );
    await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
    await deleted;

    await expect(checkbox).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
    await expect(checkbox).toHaveCount(0);
  });

  test('the api rejects a blank title as a bad request', async ({ request }) => {
    const response = await request.post('/trpc/todos.create', { data: { title: '   ' } });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { data: { code: 'BAD_REQUEST' } } });
  });

  test('says so when the api fails', async ({ page }) => {
    await page.route('**/trpc/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await page.reload();

    await expect(page.getByRole('alert')).toHaveText('Could not load the todos');
  });
});
