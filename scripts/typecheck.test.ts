import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const compiler = 'node_modules/@typescript/native/bin/tsc';

test('every typecheck program runs the pinned native compiler by path', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(manifest.devDependencies['@typescript/native']).toBe('npm:typescript@7.0.2');
  const commands = manifest.scripts.typecheck.split(' && ');
  expect(commands).toHaveLength(3);
  commands.forEach((command: string) => {
    expect(command.startsWith(`node ${compiler} `)).toBe(true);
  });
  expect(manifest.scripts.typecheck).not.toMatch(/(?:^|[&;|]\s*)tsc\b/);
  expect(manifest.scripts.typecheck).toContain('-b --force tsconfig.json');
});

test('the root lockfile importer resolves the alias independently of Fallow', () => {
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const root = lock.split('\n  .:\n')[1]?.split('\n  apps/')[0];
  expect(root).toContain(
    "      '@typescript/native':\n        specifier: npm:typescript@7.0.2\n        version: typescript@7.0.2",
  );
});

test('the native compiler reports Version 7.0.2', () => {
  const result = spawnSync(process.execPath, [compiler, '-v'], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('Version 7.0.2');
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
    const result = spawnSync(process.execPath, [compiler, '-p', directory, '--pretty', 'false'], {
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(invalid ? 2 : 0);
    if (invalid) expect(result.stdout).toContain('TS2322');
    else expect(result.stdout).toBe('');
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
