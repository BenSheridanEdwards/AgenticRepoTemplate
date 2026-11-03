import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob } from 'node:path';
import { listResults } from '../../tooling/results.mjs';
import { benchFallowConfig, benchLockfile, planWorkspace } from './generate.mjs';

const reference = {
  'apps/web/package.json':
    '{"name":"@repo/web","dependencies":{"@repo/api":"workspace:*","@repo/ui":"workspace:*"}}',
  'apps/api/package.json': '{"name":"@repo/api"}',
  'apps/web/src/App.tsx': 'import type { AppRouter } from "@repo/api";',
  'apps/api/src/router.ts': 'export const router = {};',
  'apps/architecture.mmd': 'graph TD',
  'apps/web/e2e/reference.png': Buffer.from([137, 80, 78, 71, 0, 255]),
};
const parse = (text: string) => JSON.parse(text.replace(/\/\/[^\n]*/g, ''));

test('60 packages form 30 deterministic, isolated results in existing zones', () => {
  const plan = planWorkspace({ packages: 60, reference });
  expect(plan).toEqual(planWorkspace({ packages: 60, reference }));
  const names = Object.entries(plan)
    .filter(([path]) => path.endsWith('package.json'))
    .map(([, text]) => JSON.parse(String(text)).name);
  expect(new Set(names).size).toBe(60);
  const config = parse(readFileSync('.fallowrc.jsonc', 'utf8'));
  const zones = config.boundaries.zones;
  const directory = mkdtempSync(join(tmpdir(), 'bench-plan-'));
  try {
    Object.entries(plan).forEach(([path, content]) => {
      expect(path).toMatch(/^showcase\/bench-\d{3}\/(web\/|api\/|architecture.mmd)/);
      expect(String(content)).not.toMatch(/@repo\/(web|api)/);
      const scope = path.split('/')[1];
      Array.from(String(content).matchAll(/@(bench-\d+|repo)\/(web|api|ui)/g)).forEach((match) => {
        expect(match[0] === '@repo/ui' || match[1] === scope).toBe(true);
      });
      if (path.includes('/src/'))
        expect(
          zones.some((zone: { patterns: string[] }) =>
            zone.patterns.some((glob) => matchesGlob(path, glob)),
          ),
        ).toBe(true);
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), String(content));
    });
    expect(listResults(directory).filter(({ id }) => id.startsWith('bench-'))).toHaveLength(30);
    expect(plan['showcase/bench-001/web/e2e/reference.png']).toEqual(
      reference['apps/web/e2e/reference.png'],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([0, 1, 3, -2, 2.5])('rejects invalid package count %s', (packages) => {
  expect(() => planWorkspace({ packages, reference })).toThrow();
});

const BENCH = 'showcase/bench-*/**';
const withPattern = (ignore: string[] = []) => [...new Set([...ignore, BENCH])];
const withBench = (config: {
  duplicates?: { ignore?: string[] };
  health?: { ignore?: string[] };
}) => ({
  ...config,
  duplicates: { ...config.duplicates, ignore: withPattern(config.duplicates?.ignore) },
  health: { ...config.health, ignore: withPattern(config.health?.ignore) },
});
const list = (key: string, items: string) => `  "${key}": {\n    "ignore": [${items}]\n  }`;

test.each([
  ['the repository config', readFileSync('.fallowrc.jsonc', 'utf8')],
  ['an already benchmarked config', benchFallowConfig(readFileSync('.fallowrc.jsonc', 'utf8'))],
  ['no ignore lists', '{\n  // kept\n  "rules": {}\n}\n'],
  ['empty ignore lists', `{\n${list('duplicates', '')},\n${list('health', '')}\n}\n`],
  [
    'named entries',
    `{\n${list('duplicates', '\n      "showcase/todo-01/**"\n    ')},\n${list('health', '\n      "showcase/todo-01/**"\n    ')}\n}\n`,
  ],
])('adds only the generated clones to both Fallow ignore lists: %s', (_case, original) => {
  const edited = benchFallowConfig(original);
  expect(benchFallowConfig(edited)).toBe(edited);
  expect(parse(edited)).toEqual(withBench(parse(original)));
  original
    .split('\n')
    .filter((line) => line.trim() !== '')
    .forEach((line) => {
      expect(edited).toContain(line.trimEnd().replace(/\]$/, ''));
    });
});

test('names the fix when a clone-detection block starts with another setting', () => {
  expect(() => benchFallowConfig('{\n  "duplicates": {\n    "mode": "mild"\n  }\n}\n')).toThrow(
    'put "ignore" first in "duplicates"',
  );
});

test('keeps future showcase results out of the generated clone pattern', () => {
  expect(matchesGlob('showcase/bench-001/web/src/App.tsx', BENCH)).toBe(true);
  ['apps/web/src/App.tsx', 'showcase/notes-04/web/src/App.tsx'].forEach((path) => {
    expect(matchesGlob(path, BENCH)).toBe(false);
  });
});

test.each([
  ['a leading comment', '// config\n{\n}\n'],
  ['CRLF line endings', '{\r\n}\r\n'],
])('names the fix when absent lists cannot be added: %s', (_case, original) => {
  expect(() => benchFallowConfig(original)).toThrow(
    'start the file with "{" on its own line using LF line endings',
  );
});

test('benchmark clones omit contract tests while preserving other reference files', () => {
  const plan = planWorkspace({
    packages: 2,
    reference: {
      ...reference,
      'apps/web/src/api-client/trpc.contract.test.ts': 'consumer contract',
      'apps/api/src/server.contract.test.ts': 'provider contract',
    },
  });
  expect(Object.keys(plan).filter((path) => /\.contract\.test\.ts$/.test(path))).toEqual([]);
  expect(plan).toEqual(planWorkspace({ packages: 2, reference }));
});

test('benchmark lockfile importers are idempotent and use isolated package names', () => {
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const once = benchLockfile(lock, 2);
  const twice = benchLockfile(once, 2);
  expect(twice).toBe(once);
  const keys = once.split('\npackages:')[0].match(/^ {2}\S+:$/gm) ?? [];
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain('  showcase/bench-001/web:');
  expect(keys).toContain('  showcase/bench-001/api:');
  expect(once).toContain("'@bench-001/api':");
});

const importerKeys = (lock: string) => lock.split('\npackages:')[0].match(/^ {2}\S+:$/gm) ?? [];
const isReference = (key: string) => !key.startsWith('  showcase/bench-');

test.each([
  ['the repository lockfile', readFileSync('pnpm-lock.yaml', 'utf8')],
  ['an already benchmarked lockfile', benchLockfile(readFileSync('pnpm-lock.yaml', 'utf8'), 60)],
])('benchmark lockfile regeneration replaces duplicate and stale benchmark importers: %s', (_case, lock) => {
  const once = benchLockfile(lock, 2);
  const duplicated = benchLockfile(lock, 4).replace(
    '\npackages:',
    '\n  showcase/bench-001/web:\n    dependencies: {}\n\npackages:',
  );
  expect(benchLockfile(duplicated, 2)).toBe(once);
  expect(importerKeys(once).filter(isReference)).toEqual(importerKeys(lock).filter(isReference));
  expect(once.slice(once.indexOf('\npackages:'))).toBe(lock.slice(lock.indexOf('\npackages:')));
  expect(once).toContain('version: link:../../../packages/ui');
  expect(once).toContain('version: link:../api');
});

test.each(['web', 'api'])('benchmark lockfile rejects a missing apps/%s importer', (kind) => {
  const other = kind === 'web' ? 'api' : 'web';
  const lock = `importers:\n  apps/${other}:\n    dependencies: {}\n\npackages:\n`;
  expect(() => benchLockfile(lock, 2)).toThrow(`Missing locked apps/${kind} importer`);
});
