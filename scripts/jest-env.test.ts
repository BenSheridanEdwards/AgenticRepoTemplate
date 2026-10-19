/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { isInherited } from './jest-global-setup.mjs';

/** jest-worker sets these on each worker it starts, after the global setup ran. */
const WORKER_ENV = new Set(['JEST_WORKER_ID', 'FORCE_COLOR']);

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
