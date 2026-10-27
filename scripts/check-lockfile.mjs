#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { withoutOwnImporters } from '../tooling/trial/run-trial.mjs';

const root = process.cwd();
const scratch = fs.mkdtempSync(join(tmpdir(), 'check-lockfile-'));
const id = basename(scratch).toLowerCase();
const lockfile = 'pnpm-lock.yaml';
try {
  const files = execFileSync('git', ['ls-files', '-cz', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file && fs.existsSync(join(root, file)));
  files.forEach((file) => {
    fs.mkdirSync(dirname(join(scratch, file)), { recursive: true });
    fs.cpSync(join(root, file), join(scratch, file));
  });
  const before = fs.readFileSync(join(scratch, lockfile), 'utf8');
  const install = () =>
    execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {
      cwd: scratch,
      stdio: 'inherit',
    });
  const assertStable = (ownImporters) => {
    const after = fs.readFileSync(join(scratch, lockfile), 'utf8');
    if ((ownImporters ? withoutOwnImporters(after, id) : after) !== before) {
      throw new Error(
        'pnpm install changes pnpm-lock.yaml outside new importers; pin moving dependency specs in pnpm-workspace.yaml, run pnpm install, and commit the regenerated lockfile.',
      );
    }
  };
  install();
  assertStable(false);
  ['api', 'web'].forEach((kind) => {
    const target = join(scratch, 'showcase', id, kind);
    fs.mkdirSync(target, { recursive: true });
    const reference = fs.readFileSync(join(root, 'apps', kind, 'package.json'), 'utf8');
    fs.writeFileSync(
      join(target, 'package.json'),
      reference
        .replaceAll(`@repo/${kind}`, `@${id}/${kind}`)
        .replaceAll('"@repo/api"', `"@${id}/api"`),
    );
  });
  install();
  assertStable(true);
  console.log('Lockfile is stable for a fresh install and two new showcase importers.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
