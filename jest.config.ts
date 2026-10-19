import { existsSync } from 'node:fs';
import type { Config } from 'jest';

/**
 * Three projects: `web` (jsdom) for every web package and the ui kit, `api`
 * (node) for every api package, and `tooling` for the gate scripts. Each result
 * in `apps/` or `showcase/<id>/` joins by path, with no per-result entry. The
 * transform is @swc/jest (fast, no Babel). Coverage is gated so a feature cannot
 * ship under-tested — see `.agents/project/DEFINITION_OF_DONE.md`.
 */
const existingRoots = (...folders: string[]) =>
  folders.filter((folder) => existsSync(folder)).map((folder) => `<rootDir>/${folder}`);

const shared = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
  },
  transform: {
    // Effect 4 ships ES modules only and reads `import.meta?.env`, which has no
    // CommonJS form; under Jest there is no Vite env, so it reads as undefined.
    '/node_modules/(\\.pnpm/)?effect[@/].+\\.js$': [
      '@swc/jest',
      { jsc: { transform: { optimizer: { globals: { vars: { 'import.meta': 'undefined' } } } } } },
    ],
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
  transformIgnorePatterns: ['/node_modules/(?!(\\.pnpm/)?effect[@/])'],
} satisfies Config;

const config: Config = {
  // Clears the hook's and CI's variables before any worker starts (ADR 0042).
  globalSetup: '<rootDir>/scripts/jest-global-setup.mjs',
  projects: [
    {
      ...shared,
      displayName: 'web',
      testEnvironment: 'jsdom',
      roots: existingRoots('apps', 'showcase', 'packages'),
      testMatch: [
        '<rootDir>/{apps,showcase/*}/web/src/**/*.test.{ts,tsx}',
        '<rootDir>/packages/*/src/**/*.test.{ts,tsx}',
      ],
    },
    {
      ...shared,
      displayName: 'api',
      testEnvironment: 'node',
      roots: existingRoots('apps', 'showcase'),
      testMatch: ['<rootDir>/{apps,showcase/*}/api/src/**/*.test.{ts,tsx}'],
    },
    {
      ...shared,
      displayName: 'tooling',
      testEnvironment: 'jsdom',
      roots: existingRoots('scripts', 'tooling'),
      testMatch: ['<rootDir>/scripts/**/*.test.{ts,tsx}', '<rootDir>/tooling/**/*.test.{ts,tsx}'],
    },
  ],
  collectCoverageFrom: [
    '{apps,showcase/*}/*/src/**/*.{ts,tsx}',
    'packages/*/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    // Each project skips its own test files; this keeps one project from
    // counting another's tests as untested sources.
    '!**/*.test.{ts,tsx}',
    // Excluded by design: index.ts files are pure re-export barriers; main.tsx,
    // App.tsx and the api's server.ts are composition roots, exercised by the
    // E2E behaviour map (each result's e2e/ folder) rather than the unit suite.
    // Feature logic is NOT excluded. scripts/jest-scope.test.ts holds this list
    // to that set.
    '!{apps,showcase/*,packages}/**/src/**/index.ts',
    '!{apps,showcase/*}/web/src/main.tsx',
    '!{apps,showcase/*}/web/src/App.tsx',
    '!{apps,showcase/*}/api/src/server.ts',
  ],
  // Jest's defaults plus json-summary, which tooling/coverage-by-result.mjs
  // reads to hold each result to the same threshold on its own.
  coverageReporters: ['clover', 'json', 'lcov', 'text', 'json-summary'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};

export default config;
