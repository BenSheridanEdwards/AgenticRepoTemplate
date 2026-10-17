import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnguardedSignOffPaths, isGuardedPath } from './check-sign-off-docs.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(REPOSITORY_ROOT, 'scripts/check-sign-off-docs.mjs');

const TRACKED = [
  '.husky/pre-commit',
  '.husky/pre-push',
  '.github/workflows/ci.yml',
  '.github/pull_request_template.md',
  '.claude/settings.json',
  '.claude/hooks/block-gate-bypass.sh',
  'biome.json',
  'eslint.config.js',
  'tsconfig.json',
  'scripts/check-suppressions.mjs',
  'scripts/enforcement-approval.mjs',
  'scripts/validate-pr-body.mjs',
];

const find = (markdown: string, doc = '.agents/README.md') =>
  findUnguardedSignOffPaths(markdown, doc, TRACKED);

describe('isGuardedPath', () => {
  it.each([
    '.husky/pre-push',
    '.husky',
    '.husky/',
    '.husky/**',
    '.github/workflows',
    '.github/workflows/*.yml',
    'biome.json',
    'eslint.config.*',
    'scripts/check-suppressions.mjs',
  ])('guards %s', (path) => {
    expect(isGuardedPath(path, TRACKED)).toBe(true);
  });

  it.each([
    'tsconfig.json',
    'scripts/',
    'scripts/**',
    '.github/',
    '.claude/**',
    'package.json',
  ])('leaves %s unguarded', (path) => {
    expect(isGuardedPath(path, TRACKED)).toBe(false);
  });
});

describe('findUnguardedSignOffPaths reports', () => {
  it('the stale rule row main kept after ADR 0023', () => {
    const row =
      "| Gate config (`tsconfig.json`, `biome.json`, `eslint.config.js`, hooks, workflows, scripts) changes with a maintainer's sign-off. | `enforcement-approval` status |";
    expect(find(`# Rules\n\n${row}\n`)).toEqual([{ line: 3, path: 'tsconfig.json' }]);
  });

  it('the sentence #81 rewrote by hand, at the line it starts on', () => {
    const text =
      'The hook lives in `.claude/hooks/block-gate-bypass.sh`.\nA PR that widens `.claude/settings.json` permissions waits for sign-off.';
    expect(find(text, '.agents/CLAUDE_CODE.md')).toEqual([
      { line: 2, path: '.claude/settings.json' },
    ]);
  });

  it.each([
    ['a folder only partly guarded', 'Edits to `scripts/` need sign-off.', 'scripts/'],
    [
      'an example after e.g.',
      'Sign-off covers the gate config, e.g. `tsconfig.json`.',
      'tsconfig.json',
    ],
    [
      'signed off',
      'Edits to `.claude/settings.json` are signed off by Ben.',
      '.claude/settings.json',
    ],
    [
      'a clause before a semicolon',
      'Edits to `tsconfig.json` need sign-off; docs go without sign-off.',
      'tsconfig.json',
    ],
    [
      'a linked file',
      'The [`validator`](../scripts/validate-pr-body.mjs) needs sign-off.',
      'scripts/validate-pr-body.mjs',
    ],
  ])('%s', (_name, text, path) => {
    expect(find(text).map((finding) => finding.path)).toEqual([path]);
  });
});

describe('findUnguardedSignOffPaths passes', () => {
  it.each([
    [
      'guarded paths in any spelling',
      'Edits to `.husky`, `./biome.json` and `eslint.config.*` wait for sign-off.',
    ],
    ['a link to a guarded file', 'Edits to [`biome.json`](/biome.json) wait for sign-off.'],
    ['a claim of no sign-off', 'Everything else, including `package.json`, needs no sign-off.'],
    [
      'a claim of outside the sign-off',
      '`.claude/` sits outside the `enforcement-approval` sign-off.',
    ],
    [
      'the gate script and docs as references',
      'The sign-off comment comes from `scripts/enforcement-approval.mjs`; see `.agents/project/QUALITY_GATES.md` for sign-off.',
    ],
    [
      'sign-off inside a code span only',
      'Run `scripts/check-sign-off-docs.mjs` on `tsconfig.json`.',
    ],
    [
      'a table cell apart from the claim',
      '| Doc phrasing | `scripts/check-doc-phrasing.mjs` | A doc ties sign-off to guarded files. |',
    ],
    [
      'code spans that are not paths',
      'The `enforcement-approval` status and `pnpm verify` need sign-off.',
    ],
    ['fenced code', '```md\n`tsconfig.json` needs sign-off\n```'],
    [
      'the generated GitNexus block',
      '<!-- gitnexus:start -->\n`tsconfig.json` needs sign-off.\n<!-- gitnexus:end -->',
    ],
    ['a blank line between blocks', 'Edit `tsconfig.json` freely.\n\nHooks need sign-off.'],
  ])('%s', (_name, text) => {
    expect(find(text)).toEqual([]);
  });
});

describe('check-sign-off-docs CLI', () => {
  it.each([
    REPOSITORY_ROOT,
    join(REPOSITORY_ROOT, 'scripts'),
  ])('passes on the repository docs when run from %s', (cwd) => {
    const result = spawnSync('node', [CLI], { cwd, encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK: [1-9]\d* guidance docs/);
  });

  describe('on a repo with a stale doc', () => {
    let directory: string;

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'sign-off-docs-'));
      mkdirSync(join(directory, 'scripts'));
      for (const script of [
        'check-sign-off-docs.mjs',
        'check-doc-phrasing.mjs',
        'enforcement-approval.mjs',
      ]) {
        copyFileSync(join(REPOSITORY_ROOT, 'scripts', script), join(directory, 'scripts', script));
      }
      writeFileSync(join(directory, 'tsconfig.json'), '{}\n');
      writeFileSync(
        join(directory, 'README.md'),
        '# Repo\n\nChanges to `tsconfig.json` need sign-off.\n',
      );
      spawnSync('git', ['init', '-q'], { cwd: directory });
      spawnSync('git', ['add', '-A'], { cwd: directory });
    });

    afterEach(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    it('fails and names the doc, line and path', () => {
      const result = spawnSync('node', [join(directory, 'scripts/check-sign-off-docs.mjs')], {
        cwd: directory,
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('README.md:3 `tsconfig.json`');
    });
  });
});
