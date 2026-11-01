/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

it('oxlint.config.ts has no warning severity, including overrides', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import config from './oxlint.config.ts';
    console.log(JSON.stringify([config.rules, ...config.overrides.map(value => value.rules)]));
  `,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  const rules: Record<string, string | number | (string | number)[]>[] = JSON.parse(result.stdout);
  expect(
    rules
      .flatMap((value) => Object.values(value))
      .filter((value) => {
        const severity = Array.isArray(value) ? value[0] : value;
        return severity === 'warn' || severity === 1;
      }),
  ).toEqual([]);
});

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
