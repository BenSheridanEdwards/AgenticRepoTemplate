import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnguardedSignOffPaths, isGuardedPath } from './check-sign-off-docs.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('isGuardedPath', () => {
  it.each([
    '.husky/pre-push',
    '.husky/**',
    '.github/workflows/ci.yml',
    '.github/workflows/',
    'biome.json',
    'scripts/check-suppressions.mjs',
  ])('guards %s', (path) => {
    expect(isGuardedPath(path)).toBe(true);
  });

  it.each([
    'tsconfig.json',
    'scripts/',
    '.claude/**',
    'package.json',
    '.agents/README.md',
  ])('leaves %s unguarded', (path) => {
    expect(isGuardedPath(path)).toBe(false);
  });
});

describe('findUnguardedSignOffPaths reports', () => {
  it('reports the stale rule row main kept after ADR 0023', () => {
    const row =
      "| Gate config (`tsconfig.json`, `biome.json`, `eslint.config.js`, hooks, workflows, scripts) changes with a maintainer's sign-off. | `enforcement-approval` status |";
    expect(findUnguardedSignOffPaths(`# Rules\n\n${row}\n`, '.agents/README.md')).toEqual([
      { line: 3, path: 'tsconfig.json' },
    ]);
  });

  it('reads a list item that wraps onto the next line as one block', () => {
    const item = '- Changes to `.claude/**` and\n  `.husky/**` need enforcement sign-off.';
    expect(findUnguardedSignOffPaths(item, 'docs/x.md')).toEqual([{ line: 1, path: '.claude/**' }]);
  });

  it('judges a linked code span by its target', () => {
    const line =
      '[`enforcement-approval.yml`](../../.github/workflows/enforcement-approval.yml) waits for sign-off.';
    expect(findUnguardedSignOffPaths(line, '.agents/project/QUALITY_GATES.md')).toEqual([]);
    const stale = '[`check.mjs`](../../scripts/check.mjs) needs sign-off.';
    expect(findUnguardedSignOffPaths(stale, '.agents/project/QUALITY_GATES.md')).toEqual([
      { line: 1, path: 'scripts/check.mjs' },
    ]);
  });
});

describe('findUnguardedSignOffPaths claim boundaries', () => {
  it.each([
    [
      'a block that says the file needs no sign-off',
      'Everything else, including `package.json`, needs no sign-off.',
    ],
    ['a block with no sign-off claim', 'Run `pnpm typecheck` after editing `tsconfig.json`.'],
    [
      'sign-off inside a code span only',
      'Run `scripts/check-sign-off-docs.mjs` on `tsconfig.json`.',
    ],
    ['guarded paths only', 'Edits to `.husky/**` and `biome.json` wait for sign-off.'],
    ['fenced code', '```md\n`tsconfig.json` needs sign-off\n```'],
    [
      'code spans that are not paths',
      'The `enforcement-approval` status and `pnpm verify` need sign-off.',
    ],
  ])('passes %s', (_name, text) => {
    expect(findUnguardedSignOffPaths(text, 'docs/x.md')).toEqual([]);
  });

  it('judges each sentence of a paragraph on its own', () => {
    const text =
      'The hook lives in `.claude/hooks/block-gate-bypass.sh`. A PR that edits\n`.claude/hooks/` waits for sign-off.';
    expect(findUnguardedSignOffPaths(text, 'docs/x.md')).toEqual([
      { line: 1, path: '.claude/hooks/' },
    ]);
  });

  it('judges each table cell on its own', () => {
    const row =
      '| Doc phrasing | `scripts/check-doc-phrasing.mjs` | A doc that ties sign-off to a file names a guarded one. |';
    expect(findUnguardedSignOffPaths(row, 'docs/x.md')).toEqual([]);
  });

  it('passes a file that sits outside the sign-off', () => {
    const text =
      '`.claude/` sits outside the `enforcement-approval` sign-off, so review catches it.';
    expect(findUnguardedSignOffPaths(text, 'docs/x.md')).toEqual([]);
  });

  it('keeps blocks apart at a blank line', () => {
    const text = 'Edit `tsconfig.json` freely.\n\nHooks need sign-off.';
    expect(findUnguardedSignOffPaths(text, 'docs/x.md')).toEqual([]);
  });
});

describe('check-sign-off-docs CLI', () => {
  it('passes on the repository docs', () => {
    const run = spawnSync('node', ['scripts/check-sign-off-docs.mjs'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
