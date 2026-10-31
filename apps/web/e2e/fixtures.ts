import { test as base, type ConsoleMessage, expect } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

interface ConsoleFixtures {
  expectedConsole: RegExp[];
  expectConsole: (pattern: RegExp) => void;
}

export const test = base.extend<ConsoleFixtures>({
  expectedConsole: [[], { option: true }],
  expectConsole: [
    async ({ page, expectedConsole }, use) => {
      const messages: string[] = [];
      const expected = [...expectedConsole];
      const recordConsole = (message: ConsoleMessage) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          messages.push(`console.${message.type()}: ${message.text()}`);
        }
      };
      const recordError = (error: Error) => {
        messages.push(`pageerror: ${error.message}`);
      };
      page.on('console', recordConsole);
      page.on('pageerror', recordError);
      await use((pattern) => {
        expected.push(pattern);
      });
      page.off('console', recordConsole);
      page.off('pageerror', recordError);
      expect({
        unexpected: messages.filter(
          (message) => !expected.some((pattern) => message.search(pattern) !== -1),
        ),
        missing: expected
          .filter((pattern) => !messages.some((message) => message.search(pattern) !== -1))
          .map(String),
      }).toEqual({ unexpected: [], missing: [] });
    },
    { auto: true },
  ],
});
