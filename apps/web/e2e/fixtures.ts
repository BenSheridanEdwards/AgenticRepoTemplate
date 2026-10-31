import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

interface ConsoleFixtures {
  expectedConsole: RegExp[];
  expectConsole: (pattern: RegExp) => void;
}

export const test = base.extend<ConsoleFixtures>({
  expectedConsole: [[], { option: true }],
  expectConsole: async ({ expectedConsole }, use) => {
    const expected = [...expectedConsole];
    await use((pattern) => {
      expected.push(pattern);
    });
  },
});
