import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnreasonedSuppressions } from './check-suppressions.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Split so this file holds no live directive of its own.
const TS = '@ts';
const OXLINT = 'oxlint';

describe('findUnreasonedSuppressions', () => {
  it.each([
    [`// ${TS}-ignore`, 'ts-ignore'],
    [`// ${TS}-nocheck`, 'ts-nocheck'],
    [`// ${TS}-expect-error`, 'reason'],
    [`// ${TS}-expect-error: x`, 'reason'],
  ])('reports %j', (line, kind) => {
    expect(findUnreasonedSuppressions(`const a = 1;\n${line}\n`)).toEqual([{ line: 2, kind }]);
  });

  it.each([
    `// ${TS}-expect-error the vendor type omits the optional field`,
    'const message = "eslint is the policy engine";',
  ])('passes %j', (line) => {
    expect(findUnreasonedSuppressions(line)).toEqual([]);
  });
});

describe('Oxlint directives', () => {
  it.each([
    `// ${OXLINT}-disable`,
    `// ${OXLINT}-enable`,
    `// ${OXLINT}-disable-next-line anti-slop/no-reflect-get -- reason`,
    `const value = 1; // ${OXLINT}-disable-line`,
    `/* ${OXLINT}-disable anti-slop/no-reflect-get */`,
    `/* ${OXLINT}-enable */`,
    `const element = <div>{/* ${OXLINT}-disable */}</div>;`,
    `const value = \`hello ${'${'} /* ${OXLINT}-disable */ name}\`;`,
    `/*\n * ${OXLINT}-disable\n */`,
    `/*\n${OXLINT}-enable\n*/`,
  ])('rejects %j even with a reason', (comment) => {
    expect(findUnreasonedSuppressions(`const before = 1;\n${comment}\n`)).toEqual([
      { line: comment.includes('\n') ? 3 : 2, kind: 'oxlint' },
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
    expect(findUnreasonedSuppressions(source)).toEqual([]);
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
  ])('fails with a file, line and remedy for a tracked .%s directive', (extension) => {
    const directory = mkdtempSync(join(tmpdir(), 'suppression-gate-'));

    try {
      execFileSync('git', ['init', '--quiet', directory]);
      writeFileSync(join(directory, `source.${extension}`), `// ${OXLINT}-disable\n`);
      mkdirSync(join(directory, 'vendor'));
      writeFileSync(join(directory, 'vendor/upstream.ts'), `// ${OXLINT}-disable\n`);
      execFileSync('git', ['add', '.'], { cwd: directory });

      const run = spawnSync('node', [join(REPOSITORY_ROOT, 'scripts/check-suppressions.mjs')], {
        cwd: directory,
        encoding: 'utf8',
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`source.${extension}:1`);
      expect(run.stderr).toContain('Fix the code');
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
