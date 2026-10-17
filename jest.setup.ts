// Adds custom matchers like `toBeInTheDocument`, `toHaveAccessibleName`, etc.
// so component tests assert on what a user perceives, not implementation detail.
import '@testing-library/jest-dom';

// `toHaveNoViolations` for jest-axe — lets unit tests assert accessibility.
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// jsdom leaves out the encoding globals that browsers and Node both ship, and
// Effect reads TextEncoder when it loads.
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextDecoder, TextEncoder });
