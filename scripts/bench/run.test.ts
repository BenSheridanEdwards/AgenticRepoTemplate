import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Slow: installs an offline generated workspace and drives the real gates.
test.each([false, true])('isolated benchmark cleans up (type error: %s)', (inject) => {
  const status = () => spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const before = status();
  const config = readFileSync('.fallowrc.jsonc', 'utf8');
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const start = Date.now();
  const result = spawnSync(
    'node',
    [
      'scripts/bench/run.mjs',
      '--packages',
      '2',
      '--steps',
      'typecheck,arch:gate',
      ...(inject ? ['--inject-error'] : []),
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(inject ? 1 : 0);
  if (inject) expect(result.stderr).toContain('typecheck');
  else
    ['cold', 'warm', 'one-change'].forEach((mode) => {
      expect(result.stdout).toMatch(new RegExp(`\\| typecheck \\| ${mode} \\| \\d+ \\|`));
    });
  const directory = result.stdout.match(/Workspace: (.+)/)?.[1];
  expect(directory).toBeDefined();
  expect(existsSync(String(directory))).toBe(false);
  expect(readFileSync('.fallowrc.jsonc', 'utf8')).toBe(config);
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toBe(lock);
  expect(status()).toBe(before);
  expect(Date.now() - start).toBeLessThan(120_000);
}, 120_000);
