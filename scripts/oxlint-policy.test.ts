/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, matchesGlob, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(__dirname, '..');
const command = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['lint:policy'];
const oxlintCommand = command.split(' && ')[0];
interface Diagnostic {
  code: string;
  severity: string;
  message: string;
  filename: string;
}
interface Fixture {
  path: string;
  source: string;
  code?: string;
  message?: string;
}
const mutation = 'function f(item) { item.x = 1; }';
const loops = [
  [
    'ForStatement',
    'for (;;) {}',
    'Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
  ],
  [
    'ForInStatement',
    'for (const key in value) {}',
    'Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
  ],
  [
    'ForOfStatement',
    'for (const value of values) {}',
    'Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
  ],
  [
    'WhileStatement',
    'while (value) {}',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
  ],
  [
    'DoWhileStatement',
    'do {} while (value);',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
  ],
];
const fixtures: Fixture[] = [
  ...'ts tsx mts cts js jsx mjs cjs'.split(' ').flatMap((extension) => [
    { path: `scripts/mutation.${extension}`, source: mutation, code: 'eslint(no-param-reassign)' },
    { path: `scripts/copy.${extension}`, source: 'function f(item) { return { ...item, x: 1 }; }' },
  ]),
  ...loops.map(([name, source, message]) => ({
    path: `scripts/${name}.js`,
    source: source ?? '',
    code: 'policy(no-loops)',
    message: `[${name}] ${message}`,
  })),
  {
    path: 'scripts/await.js',
    source: 'async function f(values) { for await (const value of values) {} }',
  },
  ...['apps/web', 'apps/api', 'packages/ui', 'showcase/x/web', 'showcase/x/api'].flatMap((root) => [
    {
      path: `${root}/src/deep.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { if(e) { f(); } } } } } }',
      code: 'eslint(max-depth)',
    },
    {
      path: `${root}/src/shallow.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { f(); } } } } }',
    },
    ...[
      'features/greeting/domain',
      'routes/greeting/Page',
      'shared/name/value',
      'api-client/internal',
    ].map((specifier, index) => ({
      path: `${root}/src/import${index}.ts`,
      source: `import value from './${specifier}';`,
      code: 'eslint(no-restricted-imports)',
    })),
  ]),
  {
    path: 'apps/api/src/router.ts',
    source: "import { greetingRouter } from './features/greeting/index.ts';",
  },
  ...['scripts', 'tooling'].flatMap((root) => [
    {
      path: `${root}/literal.mjs`,
      source: "const value = '**';",
      code: 'policy(no-hand-written-globs)',
    },
    {
      path: `${root}/template.ts`,
      source: 'const value = `**/`;',
      code: 'policy(no-hand-written-globs)',
    },
  ]),
  { path: 'scripts/x.test.ts', source: "const value = '**'; const other = `**/`;" },
  { path: 'scripts/x.spec.ts', source: "const value = '**';" },
  { path: 'scripts/y.mjs', source: 'const value = `**$' + '{text}**`;' },
  { path: 'scripts/unused.ts', source: 'const unused = 1;' },
  { path: 'apps/web/dist/assets/index.js', source: 'while (true) {}' },
  { path: '.cache/types/apps/web/src/App.d.ts', source: 'while (true) {}' },
  {
    path: 'scripts/disable.js',
    source: `// eslint-disable-next-line no-param-reassign\n${mutation}`,
    code: 'eslint(no-param-reassign)',
  },
  { path: 'apps/web/src/nested.ts', source: mutation, code: 'eslint(no-param-reassign)' },
];
let directory: string;
let diagnostics: Diagnostic[];
let elapsed: number;
function write(path: string, source: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), source);
}
function run(cwd: string, extra: string[] = []) {
  const [executable, ...args] = oxlintCommand.split(' ');
  return spawnSync(executable, [...args, '--format', 'json', ...extra], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
  });
}
function lintTree(cases: Fixture[]) {
  if (new Set(cases.map(({ path }) => path)).size !== cases.length)
    throw new Error('Duplicate fixture path');
  cases.forEach(({ path, source }) => {
    write(path, source);
  });
  write(
    'oxlint.config.ts',
    `export { default } from ${JSON.stringify(pathToFileURL(join(ROOT, 'oxlint.config.ts')).href)};`,
  );
  write('apps/web/.oxlintrc.json', '{"rules":{"no-param-reassign":"off"}}');
  const started = performance.now();
  const result = run(directory);
  elapsed = performance.now() - started;
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  return JSON.parse(result.stdout).diagnostics;
}
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'oxlint-policy-'));
  diagnostics = lintTree(fixtures);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it.each(fixtures)('$path has the expected policy diagnostics', ({ path, code, message }) => {
  const found = diagnostics.filter(
    ({ filename }) => filename.replaceAll('\\', '/').replace(`${directory}/`, '') === path,
  );
  expect(found.map(({ code: actual, severity }) => [actual, severity])).toEqual(
    code ? [[code, 'error']] : [],
  );
  if (message) expect(found[0]?.message).toBe(message);
});
it('runs the fixture set in under ten seconds', () => expect(elapsed).toBeLessThan(10_000));
it('rejects duplicate fixture paths', () =>
  expect(() =>
    lintTree([
      { path: 'x.js', source: '' },
      { path: 'x.js', source: '' },
    ]),
  ).toThrow('Duplicate fixture path'));
it('lint:policy runs Oxlint before ESLint', () => {
  expect(command).toBe(
    'env -u NAPI_RS_NATIVE_LIBRARY_PATH -u VP_VERSION -u OXLINT_TSGOLINT_PATH oxlint --no-ignore --config oxlint.config.ts --deny-warnings && eslint --max-warnings=0 .',
  );
});
it('the repository passes the Oxlint policy and covers every tracked source file', () => {
  const result = run(ROOT);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.diagnostics).toEqual([]);
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.split('\0');
  const ignored = [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ];
  const sources = tracked.filter(
    (path) =>
      new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']).has(extname(path)) &&
      !ignored.some((pattern) => matchesGlob(path, pattern)),
  );
  expect(report.number_of_files).toBe(sources.length);
});
