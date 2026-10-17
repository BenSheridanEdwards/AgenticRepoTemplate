/**
 * The journeys `verify.mjs drive <id>` runs. Each one follows the matching
 * feature file in `../features/`. A journey receives `{ page, step, expect }`;
 * every `step` captures a screenshot and an ARIA snapshot after its body passes.
 */
import AxeBuilder from '@axe-core/playwright';

/** Counts the requests the page sends to the api, so a step can prove none left. */
function watchApiCalls(page) {
  const calls = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/trpc/')) {
      calls.push(request.url());
    }
  });
  return calls;
}

async function submitName(page, name) {
  const field = page.getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await page.getByRole('button', { name: 'Greet' }).click();
}

const greeting = {
  id: 'greeting',
  feature: 'greeting',
  async run({ page, step, expect }) {
    const calls = watchApiCalls(page);

    await step('open the greeting page', async () => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Greeting' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('');
    });
    await step('a blank name asks for a name and sends nothing', async () => {
      await submitName(page, '');
      await expect(page.getByRole('alert')).toHaveText('Enter a name');
      expect(calls).toEqual([]);
    });
    await step('a name gets its greeting from the api', async () => {
      const answered = page.waitForResponse((response) =>
        response.url().includes('/trpc/greeting.greet'),
      );
      await submitName(page, 'Ada');
      expect((await answered).status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText('Hello, Ada!');
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(calls).toHaveLength(1);
    });
  },
};

const greetingValidation = {
  id: 'greeting-validation',
  feature: 'greeting',
  async run({ page, step, expect }) {
    const calls = watchApiCalls(page);

    await step('a whitespace name asks for a name and sends nothing', async () => {
      await page.goto('/');
      await submitName(page, '   ');
      await expect(page.getByRole('alert')).toHaveText('Enter a name');
      await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(calls).toEqual([]);
    });
  },
};

const greetingError = {
  id: 'greeting-error',
  feature: 'greeting',
  async run({ page, step, expect }) {
    await page.route('**/trpc/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await step('a failing api shows the error', async () => {
      await page.goto('/');
      await submitName(page, 'Ada');
      await expect(page.getByRole('alert')).toHaveText('Could not load the greeting');
    });
  },
};

const accessibility = {
  id: 'accessibility',
  feature: 'accessibility',
  async run({ page, step, expect }) {
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
    };

    await step('the greeting page has no WCAG A or AA violations', async () => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Greet' })).toBeVisible();
      await scan();
    });
    await step('the validation error has no WCAG A or AA violations', async () => {
      await submitName(page, '');
      await expect(page.getByRole('alert')).toHaveText('Enter a name');
      await scan();
    });
    await step('keyboard tab order reaches the field, then the button', async () => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Greet' })).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Greet' })).toBeFocused();
    });
  },
};

export const JOURNEYS = Object.fromEntries(
  [greeting, greetingValidation, greetingError, accessibility].map((journey) => [
    journey.id,
    journey,
  ]),
);
