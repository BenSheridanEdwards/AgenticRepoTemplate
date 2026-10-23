import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process, which other tests share.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const todoCheckbox = (page: Page, title: string) =>
  page.getByRole('list', { name: 'Todos' }).getByRole('checkbox', { name: title, exact: true });

async function addTodo(page: Page, title: string) {
  const saved = page.waitForResponse((response) => response.url().includes('/trpc/todos.create'));
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await saved).status()).toBe(200);
}

test.describe('Todos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('adds a trimmed todo through the api and keeps it across a reload', async ({ page }) => {
    const title = newTitle('Buy milk');

    await addTodo(page, `  ${title} `);

    await expect(todoCheckbox(page, title)).not.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('');
    await page.reload();
    await expect(todoCheckbox(page, title)).toBeVisible();
  });

  test('asks for a title and sends no write when the title is blank', async ({ page }) => {
    const writes: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/trpc') && request.method() === 'POST') {
        writes.push(request.url());
      }
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(writes).toEqual([]);
  });

  test('toggles a todo complete, then deletes it', async ({ page }) => {
    const title = newTitle('Walk the dog');
    await addTodo(page, title);

    await todoCheckbox(page, title).click();
    await expect(todoCheckbox(page, title)).toBeChecked();

    await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
    await expect(todoCheckbox(page, title)).toHaveCount(0);
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
