/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { basename, matchesGlob, relative } from 'node:path';
import config from '../jest.config';

const PACKAGE_SOURCE = /^(apps\/[^/]+|packages\/[^/]+|showcase\/[^/]+\/[^/]+)\/src\//;

const workspaceFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--', 'apps', 'packages', 'showcase', 'scripts', 'tooling'],
  { encoding: 'utf8' },
).split('\0');
const trackedFiles = workspaceFiles.filter((path) => PACKAGE_SOURCE.test(path));

const isTest = (path: string) => /\.test\.tsx?$/.test(path);
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
  return ['web', 'api', 'tooling', 'integration'].flatMap((project) => {
    const listed = execFileSync(
      'node_modules/.bin/jest',
      ['--listTests', '--json', '--selectProjects', project],
      {
        encoding: 'utf8',
      },
    );
    const paths: string[] = JSON.parse(listed);
    return paths.map((path) => relative(process.cwd(), path));
  });
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

  it('runs every test file in exactly one project', () => {
    const runs = testsJestRuns();
    expect(
      workspaceFiles
        .filter(isTest)
        .filter((path) => runs.filter((run) => run === path).length !== 1),
    ).toEqual([]);
    expect(runs.length).toBe(new Set(runs).size);
  });

  it.each([
    'apps',
    'showcase/todo-01',
  ])('assigns %s API integration tests only to integration', (result) => {
    const path = `${result}/api/src/server.integration.test.ts`;
    const owners = config.projects
      ?.filter((project) => {
        if (typeof project !== 'object') return false;
        return (
          project.testMatch?.some((pattern) =>
            matchesGlob(path, pattern.replace('<rootDir>/', '')),
          ) && !project.testPathIgnorePatterns?.some((pattern) => new RegExp(pattern).test(path))
        );
      })
      .map((project) => (typeof project === 'object' ? project.displayName : project));
    expect(owners).toEqual(['integration']);
  });
});
