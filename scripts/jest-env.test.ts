/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { isInherited } from './jest-global-setup.mjs';

/** jest-worker sets these on each worker it starts, after the global setup ran. */
const WORKER_ENV = new Set(['JEST_WORKER_ID', 'FORCE_COLOR']);

const SETUP_URL = new URL('./jest-global-setup.mjs', import.meta.url).href;

/** Runs the global setup in a child holding only `env`, and returns the names it keeps. */
function namesKeptFrom(env: Record<string, string>): string[] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { default: setup } = await import(${JSON.stringify(SETUP_URL)}); setup(); console.log(JSON.stringify(Object.keys(process.env)));`,
      ],
      { encoding: 'utf8', env },
    ),
  );
}

describe('the Jest global setup', () => {
  const rejected = [
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_WORK_TREE',
    'GIT_SOME_FUTURE_VARIABLE',
    'GITHUB_BASE_REF',
    'GITHUB_ACTIONS',
    'CI',
    'JEST_WORKER_ID',
    'CLAUDECODE',
  ];
  const kept = [
    'PATH',
    'HOME',
    'TMPDIR',
    'COREPACK_HOME',
    'COREPACK_NPM_REGISTRY',
    'LC_ALL',
    'ALL_PROXY',
    'all_proxy',
  ];
  const names = namesKeptFrom(
    Object.fromEntries([...rejected, ...kept].map((name) => [name, `/fixture/${name}`])),
  );

  it.each(rejected)('drops %s', (name) => {
    expect(names).not.toContain(name);
  });

  it.each(kept)('keeps %s', (name) => {
    expect(names).toContain(name);
  });
});

describe('a test child process environment', () => {
  it('holds only the variables scripts/jest-global-setup.mjs lets through', () => {
    const names: string[] = JSON.parse(
      execFileSync('node', ['-e', 'console.log(JSON.stringify(Object.keys(process.env)))'], {
        encoding: 'utf8',
      }),
    );

    expect(names.filter((name) => !isInherited(name) && !WORKER_ENV.has(name))).toEqual([]);
  });
});
