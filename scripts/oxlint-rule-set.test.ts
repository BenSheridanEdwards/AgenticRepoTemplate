/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { matchesGlob, resolve } from 'node:path';
import { isGuidanceDoc } from './check-doc-phrasing.mjs';

const ROOT = resolve(__dirname, '..');
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
expect(tracked.status).toBe(0);
const trackedPaths = tracked.stdout.split('\0').filter(Boolean);

it('ESLint is retired', () => {
  expect(
    trackedPaths.filter((path) => /(^|\/)(eslint\.config\.[^/]+|\.eslintrc[^/]*)$/.test(path)),
  ).toEqual([]);
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const packages = { ...manifest.dependencies, ...manifest.devDependencies };
  expect(
    [
      'eslint',
      'eslint-plugin-react-doctor',
      'eslint-plugin-react-hooks',
      'typescript-eslint',
    ].filter((name) => Object.hasOwn(packages, name)),
  ).toEqual([]);
  const commands = [
    ...Object.values(manifest.scripts),
    ...trackedPaths
      .filter((path) => path.startsWith('.husky/') || path.startsWith('.github/workflows/'))
      .map((path) => readFileSync(resolve(ROOT, path), 'utf8')),
  ];
  expect(commands.filter((command) => /(^|[\s;&|])eslint(\s|$)/.test(String(command)))).toEqual([]);
});

it('no guidance doc names a retired ESLint file or package', () => {
  const retired =
    /eslint\.config\.js|eslint-plugin-policy\.js|eslint-policy\.test\.ts|eslint-plugin-react-hooks|eslint-plugin-react-doctor|typescript-eslint|--max-warnings/;
  expect(
    trackedPaths
      .filter(isGuidanceDoc)
      .filter((path) => !path.startsWith('docs/trials/') && !path.startsWith('docs/proof/'))
      .filter((path) => retired.test(readFileSync(resolve(ROOT, path), 'utf8'))),
  ).toEqual([]);
});
const EVERY_FILE = {
  'no-param-reassign': ['error', { props: true }],
  'policy/no-loops': ['error'],
  'policy/no-hand-written-globs': ['error'],
};
const RESULT_ROOT = {
  ...EVERY_FILE,
  ...Object.fromEntries(
    [
      'one-component-per-file',
      'no-large-comments',
      'use-ui-primitives',
      'state-and-effects-in-hooks',
      'handler-names',
      'callback-prop-names',
      'pages-in-routes',
      'file-matches-export',
      'folder-names',
      'role-named-folders',
      'test-beside-subject',
      'slice-isolation',
      'procedure-input-schema',
      'form-uses-effect-schema',
    ].map((name) => [`policy/${name}`, ['error']]),
  ),
  ...Object.fromEntries(
    [
      'rules-of-hooks',
      'exhaustive-deps',
      'error-boundaries',
      'globals',
      'immutability',
      'incompatible-library',
      'preserve-manual-memoization',
      'purity',
      'refs',
      'set-state-in-effect',
      'set-state-in-render',
      'static-components',
      'use-memo',
      'void-use-memo',
      'unsupported-syntax',
    ].map((name) => [`react/${name}`, ['error']]),
  ),
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
};
const REACT_DOCTOR = {
  count: 349,
  sha256: '4de76157f37662452af5ffbcfe299d7009423e84e89aa55eb33cf8fcd5adeef3',
};
const PLUGINS = ['react'];
const JS_PLUGINS = [
  resolve(ROOT, 'tooling/eslint-plugin-policy.js'),
  {
    name: 'react-doctor',
    specifier: createRequire(resolve(ROOT, 'package.json')).resolve('oxlint-plugin-react-doctor'),
  },
];
const RESULT_PATHS = [
  'apps/web/src/App.tsx',
  'apps/api/src/router.ts',
  'packages/ui/src/index.ts',
  'showcase/x/web/src/App.tsx',
];
const OTHER_PATHS = [
  'apps/web/e2e/greeting.spec.ts',
  'scripts/x.mjs',
  'scripts/x.test.ts',
  'tooling/x.ts',
];
const PROBES = [...RESULT_PATHS, ...OTHER_PATHS];
type Rules = Record<string, string | number | unknown[]>;
interface Config {
  rules: Rules;
  categories?: Record<string, string>;
  plugins?: unknown[];
  jsPlugins?: unknown[];
  extends?: unknown;
  settings?: { 'react-doctor'?: { portedRuleMode: string } };
  overrides: {
    files: string[];
    rules: Rules;
    categories?: Record<string, string>;
    plugins?: unknown[];
    jsPlugins?: unknown[];
    extends?: unknown;
  }[];
}
const loaded = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import config from './oxlint.config.ts'; console.log(JSON.stringify(config));",
  ],
  { cwd: ROOT, encoding: 'utf8' },
);
expect(loaded.status).toBe(0);
const config: Config = JSON.parse(loaded.stdout);
// Oxlint 1.89 prints the same unresolved overrides for every input path.
const rulesFor = (path: string): Rules =>
  Object.fromEntries([
    ...Object.entries(config.rules),
    ...config.overrides
      .filter(({ files }) => files.some((pattern) => matchesGlob(path, pattern)))
      .flatMap((override) => Object.entries(override.rules)),
  ]);
const entries = (rules: Rules) =>
  Object.entries(rules).map(([name, value]) => [name, Array.isArray(value) ? value : [value]]);
const doctorNames = (rules: Rules) =>
  Object.keys(rules)
    .filter((name) => name.startsWith('react-doctor/'))
    .sort();
const digest = (names: string[]) => createHash('sha256').update(names.join('\n')).digest('hex');
function expectDoctor(rules: Rules) {
  const names = doctorNames(rules);
  const sha256 = digest(names);
  expect({
    count: names.length,
    sha256,
    names: sha256 === REACT_DOCTOR.sha256 ? [] : names,
  }).toEqual({ ...REACT_DOCTOR, names: [] });
}

it.each(PROBES)('turns on exactly the frozen rules at error for each probe path: %s', (path) => {
  const rules = rulesFor(path);
  expect(
    Object.fromEntries(
      entries(rules).filter(([name]) => !String(name).startsWith('react-doctor/')),
    ),
  ).toEqual(RESULT_PATHS.includes(path) ? RESULT_ROOT : EVERY_FILE);
  if (RESULT_PATHS.includes(path)) expectDoctor(rules);
  else expect(doctorNames(rules)).toEqual([]);
});

it('adds no rule through a category, a preset or a warning', () => {
  expect(config.plugins).toEqual(PLUGINS);
  expect(config.jsPlugins).toEqual(JS_PLUGINS);
  expect(config.settings?.['react-doctor']).toEqual({ portedRuleMode: 'curated' });
  expect(
    [config, ...config.overrides]
      .flatMap((value) => Object.values(value.categories ?? {}))
      .every((value) => value === 'off'),
  ).toBe(true);
  expect([config, ...config.overrides].map((value) => value.extends)).toEqual([
    undefined,
    undefined,
  ]);
  expect(config.overrides.map((value) => [value.plugins, value.jsPlugins])).toEqual([
    [undefined, undefined],
  ]);
  expect(
    [config.rules, ...config.overrides.map((value) => value.rules)]
      .flatMap(Object.values)
      .every((value) => (Array.isArray(value) ? value[0] : value) === 'error'),
  ).toBe(true);
});

it('matches what ESLint enforces, minus the recorded drops', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { ESLint } from 'eslint';
const engine = new ESLint();
console.log(JSON.stringify(await Promise.all(${JSON.stringify(PROBES)}.map(async path => (await engine.calculateConfigForFile(path)).rules))));`,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  const configs: Rules[] = JSON.parse(result.stdout);
  PROBES.forEach((path, index) => {
    const source = Object.fromEntries(
      Object.entries(configs[index] ?? {}).filter(
        ([, value]) => (Array.isArray(value) ? value[0] : value) === 2,
      ),
    );
    const dropped = Object.keys(source)
      .filter((name) => ['react-hooks/config', 'react-hooks/gating'].includes(name))
      .sort();
    expect(dropped).toEqual(
      RESULT_PATHS.includes(path) ? ['react-hooks/config', 'react-hooks/gating'] : [],
    );
    const mapped = Object.keys(source)
      .filter((name) => !dropped.includes(name))
      .flatMap((name) =>
        name === 'no-restricted-syntax'
          ? [
              'policy/no-loops',
              ...(['scripts/**', 'tooling/**'].some((pattern) => matchesGlob(path, pattern)) &&
              !matchesGlob(path, '**/*.{test,spec}.ts')
                ? ['policy/no-hand-written-globs']
                : []),
            ]
          : [name.replace('react-hooks/', 'react/')],
      );
    const target = rulesFor(path);
    expect(mapped.filter((name) => !Object.hasOwn(target, name))).toEqual([]);
    expect(
      Object.keys(target).filter(
        (name) =>
          !mapped.includes(name) &&
          !['react/void-use-memo', 'policy/no-hand-written-globs'].includes(name),
      ),
    ).toEqual([]);
    ['no-param-reassign', 'max-depth', 'no-restricted-imports']
      .filter((name) => Object.hasOwn(source, name))
      .forEach((name) => {
        const actual = target[name];
        const expected = source[name];
        expect(Array.isArray(actual) ? actual.slice(1) : []).toEqual(
          Array.isArray(expected) ? expected.slice(1) : [],
        );
      });
    if (RESULT_PATHS.includes(path)) expectDoctor(source);
  });
});
