import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process with its in-memory todos. The tests
 * share one api process, so each makes its own titles.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

async function addTodo(page: Page, title: string) {
  const saved = page.waitForResponse((response) => response.url().includes('/trpc/todos.create'));
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await saved).status()).toBe(200);
}

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Todos', () => {
  test('adds a trimmed title through the api and clears the field', async ({ page }) => {
    const title = newTitle('Buy milk');

    await addTodo(page, `  ${title} `);

    const list = page.getByRole('list', { name: 'Todos' });
    await expect(list.getByRole('checkbox', { name: title, exact: true })).not.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  test('asks for a title and sends no change when the title is blank', async ({ page }) => {
    const changes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/trpc')) {
        changes.push(request.url());
      }
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(changes).toEqual([]);
  });

  test('toggles and deletes a todo, and the api keeps each change', async ({ page }) => {
    const title = newTitle('Walk the dog');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });

    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();

    await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
    await expect(checkbox).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Todos' })).toBeVisible();
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

  test('the validation error state has no detectable WCAG A/AA violations', async ({ page }) => {
    await addTodo(page, newTitle('Read a book'));
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');

    expect((await scan(page)).violations).toEqual([]);
  });
});
