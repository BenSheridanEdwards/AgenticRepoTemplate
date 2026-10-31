import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSuppressions, findSuppressions } from './check-suppressions.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRECTIVES = [
  ['// @ts-expect-error the value is checked at runtime', '@ts-expect-error'],
  ['// @ts-ignore', '@ts-ignore'],
  ['// @ts-nocheck', '@ts-nocheck'],
  ['/// @ts-expect-error the value is checked at runtime', '@ts-expect-error'],
  ['/// @ts-ignore', '@ts-ignore'],
  ['/// @ts-nocheck', '@ts-nocheck'],
  ['// biome-ignore lint/style/useNamingConvention: reason', 'biome-ignore'],
  ['/* biome-ignore-all lint/x: y */', 'biome-ignore-all'],
  ['/* biome-ignore-start lint/x: y */', 'biome-ignore-start'],
  ['/* biome-ignore-end lint/x: y */', 'biome-ignore-end'],
  ['// oxlint-disable-next-line no-console', 'oxlint-disable-next-line'],
  ['// oxlint-enable no-console', 'oxlint-enable'],
  ['// eslint-disable-next-line no-console -- reason', 'eslint-disable-next-line'],
  ['// eslint-enable no-console', 'eslint-enable'],
  ['/* eslint no-console: off */', 'eslint'],
  ['/* eslint-env node */', 'eslint-env'],
  ['/* global foo */', 'global'],
  ['/* globals foo */', 'globals'],
  ['// fallow-ignore-next-line unused-export -- reason', 'fallow-ignore-next-line'],
  ['/* istanbul ignore next */', 'istanbul ignore'],
  ['/* c8 ignore next */', 'c8 ignore'],
  ['/* v8 ignore next */', 'v8 ignore'],
];
const OXLINT = 'oxlint';

describe('findSuppressions', () => {
  it.each(DIRECTIVES)('rejects %s', (comment, kind) => {
    expect(findSuppressions(`const before = 1;\n${comment}\n`)).toEqual([{ line: 2, kind }]);
  });

  it.each(DIRECTIVES)('passes %s inside string and template literals', (comment) => {
    expect(findSuppressions(`const text = ${JSON.stringify(comment)};`)).toEqual([]);
    expect(findSuppressions(`const text = \`${comment}\`;`)).toEqual([]);
  });

  it('passes a triple-slash reference directive', () => {
    expect(findSuppressions('/// <reference types="node" />')).toEqual([]);
  });

  it.each([
    ['styles.css', '/* biome-ignore lint/x: y */'],
    ['config.jsonc', '// biome-ignore lint/x: y'],
    ['config.json', '/* biome-ignore lint/x: y */'],
  ])('rejects a comment directive in %s', (path, text) => {
    expect(findSuppressions(`\n${text}`, path)).toEqual([{ line: 2, kind: 'biome-ignore' }]);
  });

  it.each([
    'styles.css',
    'config.jsonc',
    'config.json',
  ])('passes strings and prose in %s', (path) => {
    expect(findSuppressions('"/* biome-ignore lint/x: y */"', path)).toEqual([]);
    expect(findSuppressions('/* Every fallow-ignore comment names its reason. */', path)).toEqual(
      [],
    );
  });

  it('passes line comment markers in CSS outside block comments', () => {
    expect(findSuppressions('// biome-ignore lint/x: y', 'styles.css')).toEqual([]);
  });

  it.each([
    '// Every fallow-ignore comment names its reason.',
    '// eslint flags nested ternaries, so this uses an early return',
    '/* A note that mentions\n * biome-ignore in prose. */',
  ])('passes mid-sentence prose %s', (comment) => {
    expect(findSuppressions(comment)).toEqual([]);
  });
});

describe('reviewed suppression exceptions', () => {
  const files = [{ path: 'source.ts', text: '// @ts-expect-error runtime invariant\n' }];
  const exception = {
    path: 'source.ts',
    directive: '@ts-expect-error',
    reason: 'The upstream declaration omits the checked field.',
  };

  it('passes an allowlisted directive', () => {
    expect(checkSuppressions(files, [exception])).toEqual([]);
  });

  it('keeps exceptions scoped to their path and directive', () => {
    expect(
      checkSuppressions([...files, { path: 'other.ts', text: files[0].text }], [exception]),
    ).toEqual([{ path: 'other.ts', line: 1, kind: '@ts-expect-error' }]);
    expect(checkSuppressions([{ path: 'source.ts', text: '// @ts-ignore' }], [exception])).toEqual([
      { path: 'source.ts', line: 1, kind: '@ts-ignore' },
      { path: 'source.ts', line: 1, kind: 'stale allowlist entry: @ts-expect-error' },
    ]);
  });

  it('rejects a stale allowlist entry', () => {
    expect(checkSuppressions([], [exception])).toEqual([
      { path: 'source.ts', line: 1, kind: 'stale allowlist entry: @ts-expect-error' },
    ]);
  });
});

describe('Oxlint directives', () => {
  it.each([
    [`// ${OXLINT}-disable`, 'oxlint-disable'],
    [`// ${OXLINT}-enable`, 'oxlint-enable'],
    [
      `// ${OXLINT}-disable-next-line anti-slop/no-reflect-get -- reason`,
      'oxlint-disable-next-line',
    ],
    [`const value = 1; // ${OXLINT}-disable-line`, 'oxlint-disable-line'],
    [`/* ${OXLINT}-disable anti-slop/no-reflect-get */`, 'oxlint-disable'],
    [`/* ${OXLINT}-enable */`, 'oxlint-enable'],
    [`const element = <div>{/* ${OXLINT}-disable */}</div>;`, 'oxlint-disable'],
    [`const value = \`hello ${'${'} /* ${OXLINT}-disable */ name}\`;`, 'oxlint-disable'],
    [`/*\n * ${OXLINT}-disable\n */`, 'oxlint-disable'],
    [`/*\n${OXLINT}-enable\n*/`, 'oxlint-enable'],
    [`/**\n * ${OXLINT}-disable\n */`, 'oxlint-disable'],
  ])('rejects %j even with a reason', (comment, kind) => {
    expect(findSuppressions(`const before = 1;\n${comment}\n`)).toEqual([
      { line: comment.includes('\n') ? 3 : 2, kind },
    ]);
  });

  it.each([
    `const text = "${OXLINT}-disable";`,
    `const text = "// ${OXLINT}-disable";`,
    `const text = '/* ${OXLINT}-enable */';`,
    `const text = \`// ${OXLINT}-disable\`;`,
    `const element = <div>// ${OXLINT}-disable</div>;`,
    `const element = <div>/* ${OXLINT}-disable */</div>;`,
    `// explain ${OXLINT}-disable in prose`,
    `// ${OXLINT}-disabled`,
    `// ${OXLINT}-enabled`,
  ])('passes non-directive text %j', (source) => {
    expect(findSuppressions(source)).toEqual([]);
  });
});

describe('check-suppressions CLI', () => {
  it.each([
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'mts',
    'cts',
    'css',
    'json',
    'jsonc',
  ])('fails with a file, line and remedy for a tracked .%s directive', (extension) => {
    const directory = mkdtempSync(join(tmpdir(), 'suppression-gate-'));

    try {
      execFileSync('git', ['init', '--quiet', directory]);
      writeFileSync(
        join(directory, `source.${extension}`),
        '/* @ts-expect-error the value is checked at runtime */\n',
      );
      mkdirSync(join(directory, 'vendor'));
      writeFileSync(
        join(directory, 'vendor/upstream.ts'),
        '/* @ts-expect-error the value is checked at runtime */\n',
      );
      execFileSync('git', ['add', '.'], { cwd: directory });

      const run = spawnSync('node', [join(REPOSITORY_ROOT, 'scripts/check-suppressions.mjs')], {
        cwd: directory,
        encoding: 'utf8',
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`source.${extension}:1`);
      expect(run.stderr).toContain('@ts-expect-error');
      expect(run.stderr).toContain(
        'Fix the cause. An exception goes in ALLOWED_SUPPRESSIONS in scripts/check-suppressions.mjs, which needs enforcement sign-off.',
      );
      expect(run.stderr).not.toContain('vendor/upstream.ts');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('passes on the repository sources', () => {
    const run = spawnSync('node', ['scripts/check-suppressions.mjs'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
