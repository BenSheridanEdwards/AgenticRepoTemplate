/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { basename, matchesGlob } from 'node:path';
import config from '../jest.config';

const ROOT_DIR = '<rootDir>/';

const trackedFiles = execFileSync('git', ['ls-files', '-z', '--', 'apps'], { encoding: 'utf8' })
  .split('\0')
  .filter((path) => /^apps\/[^/]+\/src\//.test(path));

const isTest = (path: string) => /\.test\.[^/]+$/.test(path);
const isSource = (path: string) => /\.tsx?$/.test(path) && !isTest(path);

/** The composition root and the re-export barriers the E2E map covers instead. */
const isDeclaredExclusion = (path: string) =>
  basename(path) === 'index.ts' || /^apps\/[^/]+\/src\/(main|App)\.tsx$/.test(path);

const withoutRootDir = (pattern: string) => pattern.replace(ROOT_DIR, '');

function isCollectedForCoverage(path: string) {
  const patterns = config.collectCoverageFrom ?? [];
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((p) => p.slice(1));
  return (
    included.some((pattern) => matchesGlob(path, pattern)) &&
    !excluded.some((pattern) => matchesGlob(path, pattern))
  );
}

function isRunAsTest(path: string) {
  const roots = (config.roots ?? []).map((root) => `${withoutRootDir(root)}/`);
  return (
    roots.some((root) => path.startsWith(root)) &&
    (config.testMatch ?? []).some((pattern) => matchesGlob(path, withoutRootDir(pattern)))
  );
}

describe('Jest scope over workspace package sources', () => {
  it('finds the web package sources', () => {
    expect(trackedFiles.filter(isSource).length).toBeGreaterThan(0);
    expect(trackedFiles.filter(isTest).length).toBeGreaterThan(0);
  });

  it('collects coverage from every source file except the declared exclusions', () => {
    const misjudged = trackedFiles
      .filter(isSource)
      .filter((path) => isCollectedForCoverage(path) === isDeclaredExclusion(path));
    expect(misjudged).toEqual([]);
  });

  it('runs every test file', () => {
    expect(trackedFiles.filter(isTest).filter((path) => !isRunAsTest(path))).toEqual([]);
  });
});
