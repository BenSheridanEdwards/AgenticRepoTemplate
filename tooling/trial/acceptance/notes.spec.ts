import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

const noteItem = (page: Page, title: string) =>
  page
    .getByRole('list', { name: 'Notes' })
    .getByRole('listitem')
    .filter({
      has: page.getByRole('button', { name: `Delete ${title}`, exact: true }),
    });

async function save(page: Page, button: Locator) {
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname.startsWith('/trpc') && result.request().method() === 'POST',
  );
  await button.click();
  await response;
}

async function addNote(page: Page, title: string, body: string) {
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Body', exact: true }).fill(body);
  await save(page, page.getByRole('button', { name: 'Add', exact: true }));
  await expect(noteItem(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the Notes heading and labelled text fields', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveJSProperty(
    'tagName',
    'INPUT',
  );
  await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toHaveJSProperty(
    'tagName',
    'INPUT',
  );
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
});

['Remember this', ''].forEach((body) => {
  test(`creates and persists a note with body ${JSON.stringify(body)}`, async ({ page }) => {
    const title = `Note ${randomUUID()}`;
    await addNote(page, title, body);
    await expect(noteItem(page, title)).toContainText(title);
    await expect(noteItem(page, title)).toContainText(body);
    await page.reload();
    await expect(noteItem(page, title)).toContainText(title);
    await expect(noteItem(page, title)).toContainText(body);
  });
});

['', '   '].forEach((blank) => {
  test(`rejects the title ${JSON.stringify(blank)} with an alert and no saved note`, async ({
    page,
  }) => {
    const kept = `Kept ${randomUUID()}`;
    const body = `Rejected ${randomUUID()}`;
    await addNote(page, kept, 'Loaded marker');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(blank);
    await page.getByRole('textbox', { name: 'Body', exact: true }).fill(body);
    await page.route(
      (url) => url.pathname.startsWith('/trpc'),
      async (route) => {
        expect(route.request().method()).not.toBe('POST');
        await route.continue();
      },
    );
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Notes' })).not.toContainText(body);
    await page.reload();
    await expect(noteItem(page, kept)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Notes' })).not.toContainText(body);
  });
});

test('deletes a note permanently and keeps the other note', async ({ page }) => {
  const kept = `Kept ${randomUUID()}`;
  const title = `Deleted ${randomUUID()}`;
  await addNote(page, kept, 'Keep this');
  await addNote(page, title, 'Delete this');
  await save(page, page.getByRole('button', { name: `Delete ${title}`, exact: true }));
  await expect(noteItem(page, title)).toHaveCount(0);
  await page.reload();
  await expect(noteItem(page, kept)).toBeVisible();
  await expect(noteItem(page, title)).toHaveCount(0);
});

test('has no detectable WCAG 2.1 A or AA violation with a note listed', async ({ page }) => {
  await addNote(page, `Accessible ${randomUUID()}`, 'Read this');
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
});
