import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { platformPackages } from './bun.mjs';
import { PROGRAMS } from './typecheck.mjs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
/** Runs the pinned Bun through its by-path runner, as `pnpm typecheck` does. */
const bun = (args: string[]) =>
  spawnSync(process.execPath, ['scripts/bun.mjs', ...args], { encoding: 'utf8' });

test('typecheck runs Bun over the web, node and domain programs from one script', () => {
  expect(manifest.scripts.typecheck).toBe('node scripts/typecheck.mjs');
  expect(manifest.devDependencies.bun).toBe('1.4.4');
  expect(PROGRAMS).toEqual([
    ['-b', 'tsconfig.json'],
    ['-p', 'tsconfig.node.json'],
    ['-p', 'tsconfig.domain.json'],
  ]);
});

test('the root lockfile importer pins Bun exactly', () => {
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const root = lock.split('\n  .:\n')[1]?.split('\n  apps/')[0];
  expect(root).toContain('      bun:\n        specifier: 1.4.4\n        version: 1.4.4');
});

test.each([
  ['darwin', 'arm64', '@oven/bun-darwin-aarch64'],
  ['linux', 'x64', '@oven/bun-linux-x64'],
  ['win32', 'x64', '@oven/bun-windows-x64'],
])('looks for Bun on %s-%s in %s, then its musl build', (platform, arch, name) => {
  expect(platformPackages(platform, arch)).toEqual([name, `${name}-musl`]);
});

test('the per-platform binary reports the pinned version without the postinstall script', () => {
  const result = bun(['--version']);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(manifest.devDependencies.bun);
});

test.each([false, true])('the strict base config rejects a seeded type error: %s', (invalid) => {
  mkdirSync('.scratch', { recursive: true });
  const directory = mkdtempSync(resolve('.scratch/typecheck-'));
  try {
    writeFileSync(
      resolve(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: resolve('tsconfig.base.json'),
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [] },
        files: ['index.ts'],
      }),
    );
    writeFileSync(
      resolve(directory, 'index.ts'),
      `export const n: number = ${invalid ? "'x'" : '1'};\n`,
    );
    const result = bun(['check', '--no-script', '-p', directory]);
    expect(result.error).toBeUndefined();
    if (invalid) {
      expect(result.status).not.toBe(0);
      expect(result.stdout).toMatch(/index\.ts\(1,14\): error TS2322/);
    } else {
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('error TS');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the repository typechecks within fifteen seconds', () => {
  const start = performance.now();
  const result = spawnSync('pnpm', ['typecheck'], { encoding: 'utf8', timeout: 15_000 });
  expect(result.error).toBeUndefined();
  expect(result.stdout + result.stderr).not.toContain('error TS');
  expect(result.status).toBe(0);
  expect(performance.now() - start).toBeLessThan(15_000);
}, 20_000);
