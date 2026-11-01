// Adds custom matchers like `toBeInTheDocument`, `toHaveAccessibleName`, etc.
// so component tests assert on what a user perceives, not implementation detail.
import '@testing-library/jest-dom';

// `toHaveNoViolations` for jest-axe — lets unit tests assert accessibility.
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// jsdom leaves out the encoding globals that browsers and Node both ship, and
// Effect reads TextEncoder when it loads.
import { setImmediate } from 'node:timers';
import { format, TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextDecoder, TextEncoder });

// Jest copies process, but Node emits warnings on the original process.
const warningProcess = process.getBuiltinModule('process');
const warnings: string[] = [];
let restoreConsole: () => void = () => undefined;

const recordWarning = (warning: Error) => {
  warnings.push(`${warning.name}: ${warning.message}`);
};

beforeEach(() => {
  warnings.length = 0;
  const warn = jest.spyOn(console, 'warn').mockImplementation((...values: unknown[]) => {
    warnings.push(
      `console.warn was called during this test: ${format(...values)}. Fix the cause; a test that expects a warning mocks console.warn itself and asserts the call.`,
    );
  });
  const error = jest.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    warnings.push(
      `console.error was called during this test: ${format(...values)}. Fix the cause; a test that expects a warning mocks console.error itself and asserts the call.`,
    );
  });
  restoreConsole = () => {
    warn.mockRestore();
    error.mockRestore();
  };
  warningProcess.on('warning', recordWarning);
  process.on('warning', recordWarning);
});

afterEach(async () => {
  // Node schedules emitWarning on its own next tick, outside Jest's timers.
  await new Promise<void>((resolve) => setImmediate(resolve));
  warningProcess.off('warning', recordWarning);
  process.off('warning', recordWarning);
  restoreConsole();
  if (warnings.length > 0) {
    throw new Error(warnings.join('\n'));
  }
});
