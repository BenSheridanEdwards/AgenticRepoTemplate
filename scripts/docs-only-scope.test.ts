/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docsOnly } from './docs-only-scope.mjs';

describe('docsOnly', () => {
  it.each([
    'README.md',
    'docs/foo.md',
    '.agents/project/CONVENTIONS.md',
    'docs/guide.txt',
    'docs/prd/feature.md',
    'docs/trials/run.txt',
    'docs/proof/run.txt',
  ])('allows %s', (path) => {
    expect(docsOnly([path])).toBe(true);
  });
  it.each([
    'docs/architecture/roles.mmd',
    'packages/ui/etc/ui.api.md',
    '.github/workflows/ci.yml',
    'scripts/test.mjs',
    'eslint.config.js',
    'package.json',
    'pnpm-lock.yaml',
    'apps/web/src/App.tsx',
    'apps/web/src/fixture.md',
    'apps/web/e2e/fixture.md',
    'tooling/trial/acceptance/fixture.md',
    'showcase/example/architecture.mmd',
    'docs/../package.json',
    'docs/nested/../../guide.txt',
  ])('rejects %s alone or mixed with prose (including either side of a rename)', (path) => {
    expect(docsOnly([path])).toBe(false);
    expect(docsOnly(['docs/guide.txt', path])).toBe(false);
    expect(docsOnly([path, 'docs/guide.txt'])).toBe(false);
  });
  it('rejects an empty diff', () => {
    expect(docsOnly([])).toBe(false);
  });
});

describe('docs-only CLI', () => {
  it.each(['push', 'workflow_dispatch', ''])('fails closed for event %s', (event) => {
    const result = spawnSync('node', ['scripts/docs-only-scope.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: event },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('docs-only=false\n');
  });
  it('fails closed for a missing base', () => {
    const result = spawnSync('node', ['scripts/docs-only-scope.mjs', 'missing-base', 'HEAD'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('docs-only=false\n');
  });
});

it('writes outputs for additions, deletions, renames, empty diffs and git errors', () => {
  const directory = mkdtempSync(join(tmpdir(), 'docs-scope-'));
  const script = join(process.cwd(), 'scripts/docs-only-scope.mjs');
  const git = (...args: string[]) => {
    expect(
      spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: directory })
        .status,
    ).toBe(0);
  };
  const run = (expected: boolean, range = ['HEAD^1', 'HEAD']) => {
    const output = join(directory, 'output');
    writeFileSync(output, '');
    const result = spawnSync('node', [script, ...range], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output },
    });
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`docs-only=${expected}\n`);
  };
  try {
    git('init', '-q');
    git('commit', '-qm', 'base', '--allow-empty');
    run(false);
    mkdirSync(join(directory, 'docs'));
    writeFileSync(join(directory, 'docs/guide.txt'), 'prose');
    git('add', 'docs');
    git('commit', '-qm', 'docs');
    run(true);
    run(false, ['HEAD', 'HEAD']);
    git('mv', 'docs/guide.txt', 'code.ts');
    git('commit', '-qm', 'rename');
    run(false);
    git('rm', 'code.ts');
    git('commit', '-qm', 'delete');
    run(false);
    run(false, ['missing', 'HEAD']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
