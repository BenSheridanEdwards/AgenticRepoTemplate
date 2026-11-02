import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isInherited } from './jest-global-setup.mjs';

interface Suite {
  specs: { tests: { expectedStatus: string }[] }[];
  suites?: Suite[];
}

const specs = (suite: Suite): Suite['specs'] => [
  ...suite.specs,
  ...(suite.suites ?? []).flatMap(specs),
];

it('discovers the normal console guard behaviour without expected failures', () => {
  const source = readFileSync('apps/web/e2e/console-guard.spec.ts', 'utf8');
  expect(source).not.toMatch(/test\.fail\s*\(/);
  const output = execFileSync('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => isInherited(name))),
  });
  expect(output).toContain('a declared expected error passes');
  expect(output).not.toContain('a page console warning fails the test');
  expect(output).not.toContain('a page console error fails the test');
  expect(output).not.toContain('an uncaught page error fails the test');
  expect(output).not.toContain('a missing expected message fails the test');
  const report: { suites: Suite[] } = JSON.parse(output);
  const discovered = report.suites.flatMap(specs).flatMap((spec) => spec.tests);
  expect(discovered.length).toBeGreaterThan(0);
  discovered.forEach((test) => {
    expect(test.expectedStatus).toBe('passed');
  });
});

it('runs the dedicated guard proof with browser support in the behaviour CI job', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const lane = workflow.slice(workflow.indexOf('\n  e2e:'), workflow.indexOf('\n  security:'));
  expect(lane).toMatch(
    /Install Chromium[\s\S]*- name: Run console guard proof\n {8}if: steps.scope.outputs.docs-only != 'true'\n {8}run: pnpm e2e:console-guard[\s\S]*- run: pnpm e2e/,
  );
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(scripts['e2e:console-guard']).toBe('node --test tooling/console-guard/proof.test.mjs');
});
