import { expect, test } from '@playwright/test';

test('creates, toggles, reloads and deletes a todo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todos', level: 1 })).toBeVisible();
  const title = `Own todo ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: title, exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  await expect(checkbox).toHaveCount(0);
});

test('rejects a blank title', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Title' }).fill('   ');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a title');
});
