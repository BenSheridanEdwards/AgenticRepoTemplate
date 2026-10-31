/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

it.each([
  '.oxlintrc.json',
  'biome.json',
])('%s has no warning severity, including overrides', (file) => {
  expect(readFileSync(resolve(ROOT, file), 'utf8')).not.toMatch(/"warn"/);
});

it.each([
  'apps/web/src/main.tsx',
  'scripts/x.mjs',
  'tooling/x.ts',
])('ESLint has no warning rule for %s', (file) => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { ESLint } from 'eslint';
     const config = await new ESLint().calculateConfigForFile(process.argv[1]);
     console.log(JSON.stringify(config.rules));`,
      file,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  const rules = JSON.parse(result.stdout);
  expect(
    Object.entries(rules).filter(([, value]) => {
      const severity = Array.isArray(value) ? value[0] : value;
      return severity === 1 || severity === 'warn';
    }),
  ).toEqual([]);
});

it('Fallow has no warning rule in its resolved config', () => {
  const result = spawnSync('pnpm', ['exec', 'fallow', 'config'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const config = JSON.parse(result.stdout);
  expect(Object.entries(config.rules).filter(([, severity]) => severity === 'warn')).toEqual([]);
});
