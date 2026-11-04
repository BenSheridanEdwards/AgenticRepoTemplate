/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(__dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'tailwind-lint-'));
const cases = [
  ['order', 'text-ink flex p-4', 'enforce-consistent-class-order'],
  ...['bg-red-500', 'text-white', 'font-mono', 'rounded-sm', 'imaginary'].map((value) => [
    value,
    value,
    'no-unknown-classes',
  ]),
  ['conflict', 'p-2 p-4', 'no-conflicting-classes'],
  ['duplicate', 'p-4 p-4', 'no-duplicate-classes'],
  ['deprecated', 'flex-shrink-0', 'no-deprecated-classes'],
  ['shorthand', 'h-4 w-4', 'enforce-shorthand-classes'],
];
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), text);
};
write(
  'oxlint.config.ts',
  `import config from ${JSON.stringify(pathToFileURL(join(ROOT, 'oxlint.config.ts')).href)}; export default {...config};`,
);
const lint = (...extra: string[]) =>
  spawnSync(
    join(ROOT, 'node_modules/.bin/oxlint'),
    [
      '--no-ignore',
      '--config',
      'oxlint.config.ts',
      '--deny-warnings',
      '--format',
      'json',
      ...extra,
      '.',
    ],
    { cwd: directory, encoding: 'utf8' },
  );
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it('enforces each adopted rule in web, UI and showcase using the real v4 theme', () => {
  const roots = ['apps/web', 'packages/ui', 'showcase/probe/web'];
  roots.forEach((root) => {
    cases.forEach(([name, classes]) => {
      write(`${root}/src/${name}.tsx`, `const view = <p className="${classes}" />;`);
    });
    write(
      `${root}/src/valid.tsx`,
      'const view = <p className="flex size-4 bg-surface p-2 text-ink hover:bg-raised hover:p-4" />;',
    );
    write(
      `${root}/src/conditional.tsx`,
      "const mode = 'wide'; const view = <p className={mode === 'wide' ? 'w-full' : 'w-4'} />;",
    );
    write(
      `${root}/src/constant.tsx`,
      "const CARD = cn('bg-red-500'); const view = <p className={CARD} />;",
    );
    write(
      `${root}/src/rawConstant.tsx`,
      "const CARD = 'bg-red-500'; const view = <p className={CARD} />;",
    );
    write(`${root}/src/merge.tsx`, 'const view = <p className={`p-4 $' + '{extra}`} />;');
    write(`${root}/src/join.tsx`, "const view = <p className={['p-4', extra].join(' ')} />;");
    write(`${root}/src/partial.tsx`, "const view = <p className={cn('bg-' + color)} />;");
    write(`${root}/src/add.tsx`, "const view = <p className={'p-4 ' + extra} />;");
    write(`${root}/src/inline.tsx`, 'const view = <p style={{margin: 0}} className="w-[13px]" />;');
  });
  write('apps/api/src/ignored.tsx', 'const view = <p className="imaginary" />;');
  write('apps/web/src/ignored.test.tsx', 'const view = <p className="test-sentinel" />;');
  const result = lint();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  const diagnostics = JSON.parse(result.stdout).diagnostics.filter(
    ({ code }: { code: string }) =>
      code.startsWith('better-tailwindcss(') || code === 'policy(no-arbitrary-styles)',
  );
  const expected = [
    ...cases.map(([name, , rule]) => [name, `better-tailwindcss(${rule})`]),
    ...['rawConstant', 'merge', 'join', 'add', 'inline'].map((name) => [
      name,
      'policy(no-arbitrary-styles)',
    ]),
    ['constant', 'better-tailwindcss(no-unknown-classes)'],
    ['partial', 'better-tailwindcss(no-concatenated-classes)'],
  ];
  roots.forEach((root) => {
    expected.forEach(([name, code]) => {
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          filename: expect.stringContaining(`${root}/src/${name}.tsx`),
          code,
          severity: 'error',
        }),
      );
    });
  });
  expect(
    diagnostics.filter(({ filename }: { filename: string }) =>
      /(?:valid|ignored|conditional)/.test(filename),
    ),
  ).toEqual([]);
});

it('autofixes class order without a formatting loop with Biome', () => {
  const path = 'packages/ui/src/fix.tsx';
  write(path, 'export const view = <p className="text-ink size-4 flex p-4" />;\n');
  const result = lint('--fix', join(directory, path));
  expect(result.stderr).toBe('');
  const fixed = readFileSync(join(directory, path), 'utf8');
  expect(fixed).toContain('className="flex size-4 p-4 text-ink"');
  const biome = spawnSync(
    join(ROOT, 'node_modules/.bin/biome'),
    ['check', '--write', '--error-on-warnings', '--config-path', ROOT, join(directory, path)],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(biome.status).toBe(0);
  expect(readFileSync(join(directory, path), 'utf8')).toBe(fixed);
});
