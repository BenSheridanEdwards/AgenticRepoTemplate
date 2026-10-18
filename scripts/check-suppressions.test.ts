import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnreasonedSuppressions } from './check-suppressions.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Split so this file holds no live directive of its own.
const TS = '@ts';

describe('findUnreasonedSuppressions', () => {
  it.each([
    [`// ${TS}-ignore`, 'ts-ignore'],
    [`// ${TS}-nocheck`, 'ts-nocheck'],
    [`// ${TS}-expect-error`, 'reason'],
    [`// ${TS}-expect-error: x`, 'reason'],
  ])('reports %j', (line, kind) => {
    expect(findUnreasonedSuppressions(`const a = 1;\n${line}\n`)).toEqual([{ line: 2, kind }]);
  });

  it.each([
    `// ${TS}-expect-error the vendor type omits the optional field`,
    'const message = "eslint is the policy engine";',
  ])('passes %j', (line) => {
    expect(findUnreasonedSuppressions(line)).toEqual([]);
  });
});

describe('check-suppressions CLI', () => {
  it('passes on the repository sources', () => {
    const run = spawnSync('node', ['scripts/check-suppressions.mjs'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
