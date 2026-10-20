import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process that holds the todos in memory. Each
 * test makes its own titles and never counts todos, because one api process is
 * shared across the run.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const todoList = (page: Page) => page.getByRole('list', { name: 'Todos' });

/** Clicks and waits for the tRPC mutation it sends, so a reload never overtakes it. */
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
  await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Todos', () => {
  test('creates, toggles and deletes a todo through the api', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();

    const title = newTitle('Buy milk');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });
    await expect(checkbox).not.toBeChecked();

    await clickAndSave(page, checkbox);
    await expect(checkbox).toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();

    await clickAndSave(page, page.getByRole('button', { name: `Delete ${title}`, exact: true }));
    await expect(todoList(page).getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(todoList(page).getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
  });

  test('rejects a blank title with an alert and adds nothing', async ({ page }) => {
    const marker = newTitle('Keep me');
    await addTodo(page, marker);

    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: marker, exact: true })).toBeVisible();
    await expect(todoList(page).getByRole('checkbox', { name: /^\s*$/ })).toHaveCount(0);
  });
});
