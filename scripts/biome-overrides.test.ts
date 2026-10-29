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
function lintSeed(path: string, source: string) {
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
    const report: { diagnostics: { category: string }[] } = JSON.parse(run.stdout);
    return { status: run.status, rules: report.diagnostics.map(({ category }) => category) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('Biome naming overrides', () => {
  jest.setTimeout(30_000);

  it.each([
    'apps/web/src/features/x',
    'apps/api/src/features/x',
    'packages/ui/src',
    'showcase/todo-01/web/src/routes/x',
    'showcase/todo-01/api/src/features/x',
  ])('blocks a snake_case identifier and file name in %s', (folder) => {
    const identifier = lintSeed(`${folder}/bad.ts`, 'export const bad_name = 1;\n');
    expect(identifier.status).toBe(1);
    expect(identifier.rules).toContain('lint/style/useNamingConvention');

    const fileName = lintSeed(`${folder}/bad_name.ts`, 'export const value = 1;\n');
    expect(fileName.status).toBe(1);
    expect(fileName.rules).toContain('lint/style/useFilenamingConvention');
  });

  it('leaves the same seed alone outside every package src folder', () => {
    const result = lintSeed('scripts/bad_name.ts', 'export const bad_name = 1;\n');
    expect(result).toEqual({ status: 0, rules: [] });
  });
});
