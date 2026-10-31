import { expect, test } from './fixtures';

[
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`reference greeting at ${viewport.width}px matches approved screens`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-initial.png`, {
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a name');
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-validation.png`, {
      fullPage: true,
    });

    await page.getByRole('textbox', { name: 'Name' }).fill('Ada');
    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByRole('status')).toHaveText('Hello, Ada!');
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-success.png`, {
      fullPage: true,
    });
  });
});
