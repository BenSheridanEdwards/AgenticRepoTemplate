import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process with its in-memory store. Each test
 * makes unique titles because every test shares one api process.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const todoList = (page: Page) => page.getByRole('list', { name: 'Todos' });

const todoItem = (page: Page, title: string) =>
  todoList(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { name: title, exact: true }) });

/** Clicks and waits for the tRPC mutation the click sends, so a reload never overtakes it. */
async function clickAndSave(page: Page, target: Locator) {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith('/trpc') &&
      response.request().method() === 'POST',
  );
  await target.click();
  await saved;
}

async function addTodo(page: Page, title: string) {
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await clickAndSave(page, page.getByRole('button', { name: 'Add', exact: true }));
  await expect(todoItem(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Todos', () => {
  test('shows the Todos heading and the add controls', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });

  test('creates a todo that survives a reload unchecked', async ({ page }) => {
    const title = newTitle('Buy milk');

    await addTodo(page, title);
    await page.reload();

    await expect(page.getByRole('checkbox', { name: title, exact: true })).not.toBeChecked();
  });

  test('does not add a blank title and shows an alert', async ({ page }) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
  });

  test('toggles a todo complete and keeps it across a reload', async ({ page }) => {
    const title = newTitle('Walk the dog');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });

    await clickAndSave(page, checkbox);
    await expect(checkbox).toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();
  });

  test('deletes a todo and it stays gone after a reload', async ({ page }) => {
    const title = newTitle('Water the plants');
    await addTodo(page, title);

    await clickAndSave(page, page.getByRole('button', { name: `Delete ${title}`, exact: true }));

    await expect(todoItem(page, title)).toHaveCount(0);
    await page.reload();
    await expect(todoItem(page, title)).toHaveCount(0);
  });
});
