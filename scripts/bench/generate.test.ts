import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob } from 'node:path';
import { listResults } from '../../tooling/results.mjs';
import { benchFallowConfig, planWorkspace } from './generate.mjs';

const reference = {
  'apps/web/package.json':
    '{"name":"@repo/web","dependencies":{"@repo/api":"workspace:*","@repo/ui":"workspace:*"}}',
  'apps/api/package.json': '{"name":"@repo/api"}',
  'apps/web/src/App.tsx': 'import type { AppRouter } from "@repo/api";',
  'apps/api/src/router.ts': 'export const router = {};',
  'apps/architecture.mmd': 'graph TD',
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
      expect(content).not.toMatch(/@repo\/(web|api)/);
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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([0, 1, 3, -2, 2.5])('rejects invalid package count %s', (packages) => {
  expect(() => planWorkspace({ packages, reference })).toThrow();
});

test('only generated clones are added to the two Fallow ignore lists', () => {
  const insertion =
    /,\n {6}\/\/ generated benchmark clones of the reference result, temp copy only\n {6}"showcase\/bench-\*\/\*\*"/g;
  const original = readFileSync('.fallowrc.jsonc', 'utf8').replace(insertion, '');
  const edited = benchFallowConfig(original);
  expect(benchFallowConfig(edited)).toBe(edited);
  const config = parse(original);
  config.duplicates.ignore.push('showcase/bench-*/**');
  config.health.ignore.push('showcase/bench-*/**');
  expect(parse(edited)).toEqual(config);
  expect(edited.replace(insertion, '')).toBe(original);
  expect(matchesGlob('showcase/bench-001/web/src/App.tsx', 'showcase/bench-*/**')).toBe(true);
  ['apps/web/src/App.tsx', 'showcase/notes-04/web/src/App.tsx'].forEach((path) => {
    expect(matchesGlob(path, 'showcase/bench-*/**')).toBe(false);
  });
});
