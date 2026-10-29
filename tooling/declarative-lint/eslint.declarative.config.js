// Declarative-style checks remaining outside the policy gate (ADR 0063).
// Loop selectors are enforced by eslint.config.js; Biome owns the rest
// (`biome.declarative.json` beside this file). Run with `pnpm lint:declarative`.
import tseslint from 'typescript-eslint';

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
];
