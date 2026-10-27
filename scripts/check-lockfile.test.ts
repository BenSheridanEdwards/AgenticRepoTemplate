/** @jest-environment node */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const script = resolve('scripts/check-lockfile.mjs');

it.each(['fresh', 'stale', 'importers'])('checks %s drift without changing source', (phase) => {
  const root = mkdtempSync(join(tmpdir(), 'lockfile-test-'));
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  try {
    write('.gitignore', 'node_modules/\n');
    write('package.json', '{"private":true,"packageManager":"pnpm@11.3.0"}');
    write(
      'pnpm-workspace.yaml',
      "packages: ['apps/*', 'packages/*', 'showcase/*/web', 'showcase/*/api']\n",
    );
    write('packages/shared/package.json', '{"name":"shared","version":"1.0.0"}');
    ['web', 'api'].forEach((kind) => {
      write(
        `apps/${kind}/package.json`,
        JSON.stringify({ name: `@repo/${kind}`, dependencies: { shared: 'workspace:*' } }),
      );
    });
    if (phase === 'importers') {
      write('packages/extra/package.json', '{"name":"extra","version":"1.0.0"}');
      write(
        '.pnpmfile.cjs',
        `module.exports = { hooks: { readPackage(pkg) {
        return pkg.name === 'shared' && require('node:fs').existsSync('showcase')
          ? { ...pkg, dependencies: { extra: 'workspace:*' } } : pkg;
      } } };`,
      );
    }
    execFileSync('git', ['init', '-q', root]);
    execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['add', '.'], { cwd: root });
    const lockfile = join(root, 'pnpm-lock.yaml');
    const before =
      readFileSync(lockfile, 'utf8') + (phase === 'stale' ? '\n# stale generated content\n' : '');
    writeFileSync(lockfile, before);
    const result = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(phase === 'fresh' ? 0 : 1);
    const failure = expect.stringContaining(
      'pnpm install changes pnpm-lock.yaml outside new importers; pin moving dependency specs',
    );
    expect(result.stderr).toEqual(phase === 'fresh' ? '' : failure);
    if (phase === 'fresh') expect(result.stdout).toContain('Lockfile is stable');
    expect(readFileSync(lockfile, 'utf8')).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
