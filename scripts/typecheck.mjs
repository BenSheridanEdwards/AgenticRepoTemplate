#!/usr/bin/env node
/**
 * `pnpm typecheck`: Bun's type checker over each TypeScript program, in order,
 * stopping at the first that fails, from one Node process (ADR 0120).
 * `--no-script` keeps `bun check` from running the `check` script in
 * package.json, which is Biome.
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bunBinary } from './bun.mjs';

/** Each program's `bun check` arguments. `-b` follows `tsconfig.json`'s reference to the api program. */
export const PROGRAMS = [
  ['-b', 'tsconfig.json'],
  ['-p', 'tsconfig.node.json'],
  ['-p', 'tsconfig.domain.json'],
];

/** Checks one program with its errors on this terminal, and returns Bun's exit code. Throws when Bun cannot start. */
function check(bun, program) {
  const result = spawnSync(bun, ['check', '--no-script', ...program], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const bun = bunBinary();
  process.exitCode = PROGRAMS.some((program) => check(bun, program) !== 0) ? 1 : 0;
}
