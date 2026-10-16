/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ESLINT_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/eslint');

type LintResult = { exitCode: number | null; ruleIds: string[]; output: string };

/** Lints `source` through the real ESLint CLI as if it lived under `src/`. */
function lintPolicy(source: string): LintResult {
  const run = spawnSync(
    ESLINT_BIN,
    [
      '--max-warnings=0',
      '--format=json',
      '--stdin',
      '--stdin-filename',
      'src/__policy__/Fixture.tsx',
    ],
    { cwd: REPOSITORY_ROOT, input: source, encoding: 'utf8' },
  );
  const output = `${run.stdout}${run.stderr}`;
  let ruleIds: string[] = [];
  try {
    const [report] = JSON.parse(run.stdout) as [{ messages: { ruleId: string | null }[] }];
    ruleIds = report.messages.map((message) => message.ruleId ?? 'parse-error');
  } catch {
    ruleIds = [];
  }
  return { exitCode: run.status, ruleIds, output };
}

describe('ESLint policy stack', () => {
  jest.setTimeout(60_000);

  it('blocks a hook called inside a condition (react-hooks/rules-of-hooks)', () => {
    const result = lintPolicy(`
import { useState } from 'react';
export function Toggle({ enabled }: { enabled: boolean }) {
  if (enabled) {
    useState(0);
  }
  return <p>toggle</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/rules-of-hooks');
  });

  it('blocks impure work during render (React Compiler react-hooks/purity)', () => {
    const result = lintPolicy(`
export function Lottery() {
  const ticket = Math.random();
  return <p>{ticket}</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/purity');
  });

  it('blocks a React Doctor finding (react-doctor/no-fetch-in-effect)', () => {
    const result = lintPolicy(`
import { useEffect } from 'react';
export function Loader() {
  useEffect(() => {
    void fetch('/api/service-status');
  }, []);
  return <p>loading</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-doctor/no-fetch-in-effect');
  });

  it('passes a clean component', () => {
    const result = lintPolicy(`
export function Greeting({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('leaves general lint such as unused variables to Biome', () => {
    const result = lintPolicy(`
export function Greeting() {
  const unused = 1;
  return <p>Hello</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});
