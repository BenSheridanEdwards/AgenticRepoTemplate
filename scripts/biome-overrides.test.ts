/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BIOME_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/biome');

/**
 * Lints one seeded file with the real Biome CLI and the repo's own `biome.json`.
 * Biome's stdin mode does not name the rule, so the seed is a real file in a
 * temporary folder laid out like the repo.
 */
function lintSeed(path: string, source: string): { status: number | null; rules: string[] } {
  const directory = mkdtempSync(join(tmpdir(), 'biome-overrides-'));
  try {
    copyFileSync(join(REPOSITORY_ROOT, 'biome.json'), join(directory, 'biome.json'));
    copyFileSync(join(REPOSITORY_ROOT, '.gitignore'), join(directory, '.gitignore'));
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), source);
    const run = spawnSync(BIOME_BIN, ['lint', path, '--reporter=json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report = JSON.parse(run.stdout) as { diagnostics: { category: string }[] };
    return { status: run.status, rules: report.diagnostics.map(({ category }) => category) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('Biome naming overrides', () => {
  jest.setTimeout(30_000);

  it('blocks a snake_case identifier in a workspace package source file', () => {
    const result = lintSeed('apps/web/src/features/x/bad.ts', 'export const bad_name = 1;\n');
    expect(result.status).toBe(1);
    expect(result.rules).toContain('lint/style/useNamingConvention');
  });

  it('blocks a snake_case file name in a workspace package source folder', () => {
    const result = lintSeed('apps/web/src/features/x/bad_name.ts', 'export const value = 1;\n');
    expect(result.status).toBe(1);
    expect(result.rules).toContain('lint/style/useFilenamingConvention');
  });

  it('leaves the same seed alone outside apps/*/src', () => {
    const result = lintSeed('scripts/bad_name.ts', 'export const bad_name = 1;\n');
    expect(result).toEqual({ status: 0, rules: [] });
  });
});
