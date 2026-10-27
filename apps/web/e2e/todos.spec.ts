import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('creates, lists, toggles, reloads and deletes todos through /trpc', async ({ page }) => {
  const title = `Read the brief ${crypto.randomUUID()}`;
  await page.goto('/todos');
  await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
  const answered = page.waitForResponse((response) =>
    response.url().includes('/trpc/todos.create'),
  );
  await page.getByRole('textbox', { name: 'Title' }).fill(`  ${title}  `);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  expect((await answered).status()).toBe(200);
  const list = page.getByRole('list', { name: 'Todos', exact: true });
  const checkbox = list.getByRole('checkbox', { name: title, exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await list.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await page.reload();
  await expect(checkbox).toHaveCount(0);
});

test('blank titles show an accessible alert without creating a todo', async ({ page }) => {
  const creates: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/trpc/todos.create')) creates.push(request.url());
  });
  await page.goto('/todos');
  await expect(page.getByRole('list', { name: 'Todos', exact: true })).toBeAttached();
  await page.getByRole('textbox', { name: 'Title' }).fill('   ');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a title');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(creates).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('the api rejects a blank title', async ({ request }) => {
  const response = await request.post('/trpc/todos.create', { data: { title: '   ' } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { data: { code: 'BAD_REQUEST' } } });
});

test('says so when the list request fails', async ({ page }) => {
  await page.route('**/trpc/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/todos');
  await expect(page.getByRole('alert')).toHaveText('Could not load todos');
});
