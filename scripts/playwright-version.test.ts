/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { playwrightVersion } from './playwright-version.mjs';

describe('playwrightVersion', () => {
  it('reads the root importer version from the real lockfile', () => {
    expect(playwrightVersion(readFileSync('pnpm-lock.yaml', 'utf8'))).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('drops the peer suffix pnpm appends to a resolved version', () => {
    const lock =
      "      '@playwright/test':\n        specifier: ^1.61.0\n        version: 1.61.0(x@1)\n";
    expect(playwrightVersion(lock)).toBe('1.61.0');
  });

  it('fails when the lockfile has no root @playwright/test entry', () => {
    expect(() => playwrightVersion('lockfileVersion: 9.0\n')).toThrow(/Missing resolved/);
  });
});
