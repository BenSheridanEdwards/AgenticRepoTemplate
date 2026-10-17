/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { basename, matchesGlob, relative } from 'node:path';
import config from '../jest.config';

const PACKAGE_SOURCE = /^(apps\/[^/]+|packages\/[^/]+|showcase\/[^/]+\/[^/]+)\/src\//;

const trackedFiles = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'packages', 'showcase'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter((path) => PACKAGE_SOURCE.test(path));

const isTest = (path: string) => /\.test\.[^/]+$/.test(path);
const isSource = (path: string) => /\.tsx?$/.test(path) && !isTest(path);

/** Type declarations, the re-export barriers, and the composition roots the E2E map covers. */
const isDeclaredExclusion = (path: string) =>
  path.endsWith('.d.ts') ||
  basename(path) === 'index.ts' ||
  /^(apps|showcase\/[^/]+)\/web\/src\/(main|App)\.tsx$/.test(path) ||
  /^(apps|showcase\/[^/]+)\/api\/src\/server\.ts$/.test(path);

function isCollectedForCoverage(path: string) {
  const patterns = config.collectCoverageFrom ?? [];
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((p) => p.slice(1));
  return (
    included.some((pattern) => matchesGlob(path, pattern)) &&
    !excluded.some((pattern) => matchesGlob(path, pattern))
  );
}

/** Sources whose coverage collection disagrees with the declared exclusions. */
const misjudged = (paths: string[]) =>
  paths
    .filter(isSource)
    .filter((path) => isCollectedForCoverage(path) === isDeclaredExclusion(path));

/** The test files Jest itself would run, as repository-relative paths. */
function testsJestRuns() {
  const listed = execFileSync('node_modules/.bin/jest', ['--listTests', '--json'], {
    encoding: 'utf8',
  });
  return new Set((JSON.parse(listed) as string[]).map((path) => relative(process.cwd(), path)));
}

describe('Jest scope over workspace package sources', () => {
  it.each([
    'apps/web/src/',
    'apps/api/src/',
    'packages/ui/src/',
  ])('finds sources and tests in %s', (folder) => {
    const inFolder = trackedFiles.filter((path) => path.startsWith(folder));
    expect(inFolder.filter(isSource).length).toBeGreaterThan(0);
    expect(inFolder.filter(isTest).length).toBeGreaterThan(0);
  });

  it('collects coverage from every package kind, showcase results included', () => {
    const paths = [
      'apps/api/src/features/greeting/domain.ts',
      'packages/ui/src/Button.tsx',
      'showcase/todo-01/web/src/routes/todos/TodosPage.tsx',
      'showcase/todo-01/api/src/features/todos/application.ts',
    ];
    expect(paths.filter((path) => !isCollectedForCoverage(path))).toEqual([]);
  });

  it('leaves out only the composition roots of a showcase result', () => {
    const paths = [
      'showcase/todo-01/web/src/main.tsx',
      'showcase/todo-01/web/src/App.tsx',
      'showcase/todo-01/api/src/server.ts',
    ];
    expect(paths.filter(isCollectedForCoverage)).toEqual([]);
    expect(misjudged(paths)).toEqual([]);
  });

  it('collects coverage from every source file except the declared exclusions', () => {
    expect(misjudged(trackedFiles)).toEqual([]);
  });

  it('accepts a tracked declaration file as a declared exclusion', () => {
    expect(misjudged(['apps/web/src/vite-env.d.ts'])).toEqual([]);
  });

  it('runs every test file', () => {
    const runs = testsJestRuns();
    expect(trackedFiles.filter(isTest).filter((path) => !runs.has(path))).toEqual([]);
  });
});
