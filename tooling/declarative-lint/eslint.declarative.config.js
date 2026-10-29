// Advisory declarative-style rules, outside every gate (ADR 0063). ESLint owns
// the loop selectors; Biome owns the rest
// (`biome.declarative.json` beside this file). Run with `pnpm lint:declarative`.
import tseslint from 'typescript-eslint';

const loopSelectors = [
  {
    selector: 'ForStatement',
    message:
      '[ForStatement] Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
  },
  {
    selector: 'ForInStatement',
    message:
      '[ForInStatement] Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
  },
  {
    selector: 'ForOfStatement[await=false]',
    message:
      '[ForOfStatement] Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
  },
  {
    selector: 'WhileStatement',
    message:
      '[WhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
  },
  {
    selector: 'DoWhileStatement',
    message:
      '[DoWhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
  },
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/generated/**',
      'coverage/**',
      'vendor/**',
      'playwright-report/**',
      'test-results/**',
      '.cache/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,jsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': ['warn', ...loopSelectors],
    },
  },
];
