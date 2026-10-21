import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The todo behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process that keeps the todos in memory. Each
 * test makes its own titles, because every result's api process is shared
 * across the specs in this run.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

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
  test('creates a todo, toggles it, and keeps it across a reload', async ({ page }) => {
    const title = newTitle('Buy milk');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });
    await expect(checkbox).not.toBeChecked();

    await clickAndSave(page, checkbox);
    await expect(checkbox).toBeChecked();

    await page.reload();
    await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeChecked();
  });

  test('deletes a todo, and it stays gone after a reload', async ({ page }) => {
    const title = newTitle('Water the plants');
    await addTodo(page, title);

    await clickAndSave(page, page.getByRole('button', { name: `Delete ${title}`, exact: true }));

    await expect(page.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
  });

  test('rejects a blank title with an alert and sends no request', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/trpc')) {
        apiCalls.push(request.method());
      }
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(apiCalls).not.toContain('POST');
  });
});
