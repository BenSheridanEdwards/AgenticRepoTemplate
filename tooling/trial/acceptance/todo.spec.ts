import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * The fixed Todo acceptance spec (ADR 0034). Playwright runs it as the
 * `<id>-acceptance` project against every showcase result's own servers. It
 * drives only the UI contract in `tooling/trial/todo-prompt.md`, so it fits
 * any result that keeps that contract. Each test makes its own titles and
 * never counts todos, because the tests share one api process.
 */
const newTitle = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const todoList = (page: Page) => page.getByRole('list', { name: 'Todos' });

const todoItem = (page: Page, title: string) =>
  todoList(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { name: title, exact: true }) });

async function addTodo(page: Page, title: string) {
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(todoItem(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Todo acceptance', () => {
  test('shows the Todos heading, the Title field and the Add button', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });

  test('creates a todo that appears unchecked in the Todos list', async ({ page }) => {
    const title = newTitle('Buy milk');

    await addTodo(page, title);

    await expect(todoList(page)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: title, exact: true })).not.toBeChecked();
  });

  for (const blank of ['', '   ']) {
    test(`adds nothing and shows an alert for the title ${JSON.stringify(blank)}`, async ({
      page,
    }) => {
      const loaded = newTitle('Loaded marker');
      await addTodo(page, loaded);

      await page.getByRole('textbox', { name: 'Title' }).fill(blank);
      await page.getByRole('button', { name: 'Add', exact: true }).click();

      await expect(page.getByRole('alert')).toBeVisible();
      await page.reload();
      await expect(todoItem(page, loaded)).toBeVisible();
      await expect(todoList(page).getByRole('checkbox', { name: /^\s*$/ })).toHaveCount(0);
    });
  }

  test('toggles a todo complete and back, and keeps each state across a reload', async ({
    page,
  }) => {
    const title = newTitle('Walk the dog');
    await addTodo(page, title);
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });

    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await page.reload();
    await expect(checkbox).toBeChecked();

    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await page.reload();
    await expect(checkbox).not.toBeChecked();
  });

  test('deletes a todo, and it stays gone after a reload', async ({ page }) => {
    const kept = newTitle('Loaded marker');
    const title = newTitle('Water the plants');
    await addTodo(page, kept);
    await addTodo(page, title);

    await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();

    await expect(todoItem(page, title)).toHaveCount(0);
    await page.reload();
    await expect(todoItem(page, kept)).toBeVisible();
    await expect(todoItem(page, title)).toHaveCount(0);
  });

  test('has no detectable WCAG 2.1 A or AA violation with a todo listed', async ({ page }) => {
    await addTodo(page, newTitle('Read a book'));

    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(scan.violations).toEqual([]);
  });
});
