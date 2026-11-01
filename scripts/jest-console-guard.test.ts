/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isInherited } from './jest-global-setup.mjs';

const root = resolve('.');
mkdirSync(join(root, '.scratch'), { recursive: true });
const directory = mkdtempSync(join(root, '.scratch/jest-console-'));

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function runTest(environment: string, body: string) {
  const file = join(directory, 'console.test.ts');
  writeFileSync(file, body);
  const config = {
    rootDir: directory,
    testEnvironment: environment === 'node' ? 'node' : require.resolve('jest-environment-jsdom'),
    setupFilesAfterEnv: [join(root, 'tooling/jest/jest.setup.ts')],
    transform: {
      '^.+\\.tsx?$': [require.resolve('@swc/jest'), { jsc: { parser: { syntax: 'typescript' } } }],
    },
  };
  const result = spawnSync(
    join(root, 'node_modules/.bin/jest'),
    ['--config', JSON.stringify(config), '--runInBand', '--silent=false'],
    {
      encoding: 'utf8',
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => isInherited(name))),
      timeout: 20_000,
    },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

describe.each(['node', 'jsdom'])('the Jest console guard in %s', (environment) => {
  it.each(['warn', 'error'])('fails a test that calls console.%s', (method) => {
    const result = runTest(environment, `it('warns', () => { console.${method}('x'); });`);
    expect(result.output).toContain(`console.${method} was called during this test: x`);
    expect(result.status).toBe(1);
  });

  it('fails a test that emits a Node deprecation warning', () => {
    const result = runTest(
      environment,
      `it('warns', () => {
        process.emitWarning('old', 'DeprecationWarning');
      });`,
    );
    expect(result.output).toContain('DeprecationWarning: old');
    expect(result.status).toBe(1);
  });

  it('allows a test to mock and assert its expected warning', () => {
    const result = runTest(
      environment,
      `it('expects a warning', () => {
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        console.warn('x');
        expect(warning).toHaveBeenCalledWith('x');
        warning.mockRestore();
      });`,
    );
    expect(result.output).toContain('1 passed');
    expect(result.status).toBe(0);
  });

  it('passes a clean test', () => {
    const result = runTest(environment, `it('is clean', () => { expect(1).toBe(1); });`);
    expect(result.output).toContain('1 passed');
    expect(result.status).toBe(0);
  });
});
