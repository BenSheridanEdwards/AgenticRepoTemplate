import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pactDirectory = mkdtempSync(join(tmpdir(), 'art-contract-gate-'));
const env = {
  ...process.env,
  PACT_DIR: pactDirectory,
  SCARF_ANALYTICS: 'false',
  PACT_DO_NOT_TRACK: 'true',
};

function run(args: string[]) {
  return spawnSync(
    'node_modules/.bin/jest',
    ['--selectProjects', 'contract', ...args, '--runInBand'],
    {
      env,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
}

it('accepts the shipped consumer and provider, then rejects a broken greeting contract', () => {
  const consumer = run(['apps/web']);
  expect(consumer.stdout + consumer.stderr).toContain('Tests:');
  expect(consumer.status).toBe(0);
  const provider = run(['apps/api']);
  expect(provider.status).toBe(0);
  const path = join(pactDirectory, 'web-api.json');
  const pact = readFileSync(path, 'utf8');
  expect(pact).toContain('Hello, Ada!');
  writeFileSync(path, pact.replaceAll('Hello, Ada!', 'Hello there, Ada!'));
  const broken = run(['apps/api']);
  expect(broken.status).toBe(1);
  expect(broken.stdout + broken.stderr).toContain('greeting.greet');
  expect(broken.stdout + broken.stderr).not.toContain('DEP0060');
}, 180_000);
