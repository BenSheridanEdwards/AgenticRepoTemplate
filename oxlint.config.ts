import { fileURLToPath } from 'node:url';

export default {
  categories: {
    correctness: 'off',
    suspicious: 'off',
    pedantic: 'off',
    perf: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  },
  plugins: [],
  options: { respectEslintDisableDirectives: false },
  jsPlugins: [fileURLToPath(new URL('./tooling/eslint-plugin-policy.js', import.meta.url))],
  ignorePatterns: [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ],
  rules: {
    'no-param-reassign': ['error', { props: true }],
    'policy/no-loops': 'error',
    'policy/no-hand-written-globs': 'error',
  },
  overrides: [
    {
      files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
      rules: {
        'max-depth': ['error', 4],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/features/*/*',
                  '**/shared/*/*',
                  '**/routes/*/*',
                  '**/api-client/*',
                  '!**/features/*/index.ts',
                  '!**/routes/*/index.ts',
                ],
                message:
                  'Import the module through its public surface, for example `../../features/name-input` or `./features/greeting/index.ts` in the api.',
              },
            ],
          },
        ],
      },
    },
  ],
};
