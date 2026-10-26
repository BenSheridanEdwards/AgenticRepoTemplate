export default {
  id: 'todos',
  feature: 'todos',
  async run({ page, step, expect }) {
    const title = 'Read the Todo brief';
    const checkbox = page.getByRole('checkbox', { name: title, exact: true });
    await step('blank title shows an alert', async () => {
      await page.goto('/todos');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Enter a title');
    });
    await step('add a todo through the api', async () => {
      await page.getByRole('textbox', { name: 'Title' }).fill(title);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(checkbox).not.toBeChecked();
    });
    await step('complete the todo and reload', async () => {
      await checkbox.click();
      await expect(checkbox).toBeChecked();
      await page.reload();
      await expect(checkbox).toBeChecked();
    });
    await step('reopen and delete the todo', async () => {
      await checkbox.click();
      await expect(checkbox).not.toBeChecked();
      await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
      await expect(checkbox).toHaveCount(0);
    });
  },
};
