/** @jest-environment node */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const script = resolve('scripts/check-lockfile.mjs');

it('checks fresh installs without changing the checkout and reports stale lockfiles', () => {
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
    execFileSync('git', ['init', '-q', root]);
    execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['add', '.'], { cwd: root });
    const lockfile = join(root, 'pnpm-lock.yaml');
    const before = readFileSync(lockfile, 'utf8');
    const clean = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
    expect(clean.stderr).toBe('');
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('Lockfile is stable');
    expect(readFileSync(lockfile, 'utf8')).toBe(before);
    writeFileSync(lockfile, `${before}\n# stale generated content\n`);
    const stale = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('pnpm install changes pnpm-lock.yaml');
    expect(stale.stderr).toContain('pin moving dependency specs');
    expect(readFileSync(lockfile, 'utf8')).toBe(`${before}\n# stale generated content\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
