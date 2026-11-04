#!/usr/bin/env node
/**
 * Runs the Bun that `pnpm install` pinned, by path, passing every argument
 * through: `node scripts/bun.mjs check --no-script -p tsconfig.json`.
 *
 * The `bun` package's own `bin` is a placeholder that its postinstall script
 * replaces, and CI installs with `--ignore-scripts`. The binary itself ships in
 * the per-platform package that pnpm installs beside `bun`, so this runs that
 * file directly and works the same after either install (ADR 0120).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARCHITECTURES = { arm64: 'aarch64', x64: 'x64' };
const PLATFORMS = { win32: 'windows' };

/**
 * The per-platform package names that can hold Bun on this machine, glibc
 * before musl; pnpm installs only the one whose `libc` matches. Pure.
 *
 * @param {string} platform a `process.platform` value
 * @param {string} arch a `process.arch` value
 * @returns {string[]}
 */
export function platformPackages(platform, arch) {
  const name = `@oven/bun-${PLATFORMS[platform] ?? platform}-${ARCHITECTURES[arch] ?? arch}`;
  return [name, `${name}-musl`];
}

/**
 * The path of the pinned Bun binary. pnpm and npm both place a package's
 * optional dependencies in the `node_modules` folder that holds it.
 * Throws when no installed per-platform package matches this machine.
 *
 * @returns {string}
 */
export function bunBinary() {
  const bunPackage = realpathSync(fileURLToPath(import.meta.resolve('bun/package.json')));
  const modules = dirname(dirname(bunPackage));
  const executable = process.platform === 'win32' ? 'bin/bun.exe' : 'bin/bun';
  const candidates = platformPackages(process.platform, process.arch).map((name) =>
    join(modules, name, executable),
  );
  const found = candidates.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error(
      `No Bun binary for ${process.platform}-${process.arch}; looked for ${candidates.join(', ')}. Run pnpm install.`,
    );
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const result = spawnSync(bunBinary(), process.argv.slice(2), { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
