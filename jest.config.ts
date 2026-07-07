import type { Config } from 'jest';

/**
 * Unit + component tests run on jsdom with React Testing Library.
 * Transform is @swc/jest (fast, no Babel). Coverage is gated so a feature
 * cannot ship under-tested — see `.agents/project/DEFINITION_OF_DONE.md`.
 */
const config: Config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/scripts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/scripts/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
  },
  transform: {
    // Also transform .mjs so scripts/*.mjs (e.g. validate-pr-body.mjs) can be
    // imported directly by their co-located tests.
    '^.+\\.(t|j)sx?$|^.+\\.mjs$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    // Excluded by design: index.ts files are pure re-export barriers; main.tsx
    // and App.tsx are the composition root, exercised by the E2E behaviour map
    // (e2e/app.spec.ts) rather than the unit suite. Feature logic is NOT excluded.
    '!src/**/index.ts',
    '!src/main.tsx',
    '!src/App.tsx',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};

export default config;
