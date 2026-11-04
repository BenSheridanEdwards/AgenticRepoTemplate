#!/usr/bin/env node
/**
 * Reads the resolved `@playwright/test` version from pnpm-lock.yaml, so every
 * browser cache key names the exact Playwright release (ADR 0091, ADR 0117).
 *
 * CLI: appends `version=<x.y.z>` to $GITHUB_OUTPUT, or prints it without one.
 */

import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT_IMPORTER = /^ {6}'@playwright\/test':\n {8}specifier: .+\n {8}version: ([^\s(]+)/m;

/** The version the root importer resolves for `@playwright/test`. Throws when it is missing. */
export function playwrightVersion(lockfile) {
  const version = lockfile.match(ROOT_IMPORTER)?.[1];
  if (!version) throw new Error('Missing resolved @playwright/test version in pnpm-lock.yaml');
  return version;
}

// realpath and pathToFileURL keep the guard true for symlinked or spaced paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const line = `version=${playwrightVersion(readFileSync('pnpm-lock.yaml', 'utf8'))}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}
