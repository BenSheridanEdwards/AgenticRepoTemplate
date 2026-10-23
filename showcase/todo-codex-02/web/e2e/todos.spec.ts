import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('creates, toggles, reloads and deletes a todo', async ({ page }) => {
  const title = `Trial todo ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const checkbox = page.getByRole('list', { name: 'Todos' }).getByRole('checkbox', { name: title });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: `Delete ${title}` }).click();
  await expect(checkbox).toHaveCount(0);
  await page.reload();
  await expect(checkbox).toHaveCount(0);
});

test('rejects blank titles', async ({ page }) => {
  await page.goto('/');
  for (const title of ['', '   ']) {
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');
  }
});

test('reports an api failure', async ({ page }) => {
  await page.route('**/trpc/**', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('Could not load todos');
});
