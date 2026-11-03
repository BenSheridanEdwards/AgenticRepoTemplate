import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const failures = [
  { title: 'console.warning', diagnostic: 'console.warning: x' },
  { title: 'console.error', diagnostic: 'console.error: x' },
  { title: 'pageerror', diagnostic: 'pageerror: x' },
  { title: 'missing expected message', diagnostic: '/expected error/' },
];
const specs = (suite) => [...suite.specs, ...(suite.suites ?? []).flatMap(specs)];

function rejectViolation(spec, diagnostic) {
  assert.ok(spec, `Missing guard case: ${diagnostic}`);
  assert.equal(spec.tests.length, 1);
  const [result] = spec.tests;
  assert.equal(result.expectedStatus, 'passed');
  assert.equal(result.status, 'unexpected', `${spec.title} must fail`);
  assert.ok(result.results.length > 0);
  result.results.forEach((attempt) => {
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.errors.length, 1);
    const [error] = attempt.errors;
    assert.equal(error.location.file, join(root, 'apps/web/e2e/fixtures.ts'));
    const message = stripVTControlCharacters(error.message);
    const received = message.split('\n').flatMap((line) => {
      const match = /^\+\s+"([^"]+)",?$/.exec(line);
      return match ? [match[1]] : [];
    });
    assert.deepEqual(received, [diagnostic], message);
    assert.match(message, /toEqual/);
  });
}

function runChild(config, directory, args = [], environment = {}) {
  // Keep the report outside Playwright's cleaned results directory and off stdout.
  const reportFile = `${directory}.json`;
  const child = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve('@playwright/test/cli')),
      'test',
      '--config',
      config,
      '--reporter=json',
      '--output',
      directory,
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...environment,
        E2E_BASE_URL: '',
        FORCE_COLOR: '0',
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return collectReport(child, reportFile);
}

function collectReport(child, reportFile) {
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  assert.deepEqual(report.errors, [], child.stderr);
  return { child, report, cases: report.suites.flatMap(specs) };
}

test('report collection rejects missing, malformed and setup-failed reports', () => {
  mkdirSync(join(root, '.scratch'), { recursive: true });
  const directory = mkdtempSync(join(root, '.scratch/console-guard-report-'));
  const reportFile = join(directory, 'report.json');
  const report = { errors: [], suites: [] };
  const child = {
    error: undefined,
    signal: null,
    status: 1,
    stdout: JSON.stringify(report),
    stderr: 'child diagnostics',
  };
  try {
    assert.throws(() => collectReport(child, reportFile), { code: 'ENOENT' });
    writeFileSync(reportFile, 'GitCommitInfo: not a report');
    assert.throws(() => collectReport(child, reportFile), SyntaxError);
    writeFileSync(
      reportFile,
      JSON.stringify({ errors: [{ message: 'setup failed' }], suites: [] }),
    );
    assert.throws(() => collectReport(child, reportFile), /child diagnostics/);
    writeFileSync(reportFile, JSON.stringify({ errors: [] }));
    assert.throws(() => collectReport(child, reportFile), TypeError);
    writeFileSync(reportFile, JSON.stringify(report));
    assert.deepEqual(collectReport(child, reportFile), { child, report, cases: [] });
    assert.throws(
      () => collectReport({ ...child, error: new Error('spawn failed') }, reportFile),
      /spawn failed/,
    );
    assert.throws(
      () => collectReport({ ...child, signal: 'SIGTERM' }, reportFile),
      /child diagnostics/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the real browser fixture rejects four guard violations and allows declared errors', () => {
  mkdirSync(join(root, '.scratch'), { recursive: true });
  const directory = mkdtempSync(join(root, '.scratch/console-guard-'));
  try {
    const { child, report, cases } = runChild(
      'tooling/console-guard/playwright.config.ts',
      join(directory, 'results'),
      [],
      { GITHUB_ACTIONS: 'true', DEBUG_GIT_COMMIT_INFO: '1' },
    );
    assert.match(child.stdout, /^GitCommitInfo:/m);
    assert.equal(cases.length, 5, child.stderr);
    failures.forEach(({ title, diagnostic }) => {
      rejectViolation(
        cases.find((entry) => entry.title === title),
        diagnostic,
      );
    });
    const declared = cases.find(({ title }) => title === 'declared expected error');
    assert.ok(declared);
    assert.equal(declared.tests.length, 1);
    const [passing] = declared.tests;
    assert.equal(passing.expectedStatus, 'passed');
    assert.equal(passing.status, 'expected');
    assert.equal(passing.results.length, 1);
    assert.equal(passing.results[0].status, 'passed');
    assert.deepEqual(passing.results[0].errors, []);
    assert.equal(report.stats.expected, 1);
    assert.equal(report.stats.unexpected, 4);
    assert.equal(report.stats.skipped, 0);
    assert.equal(report.stats.flaky, 0);
    assert.equal(child.status, 1);

    const fixture = readFileSync(join(root, 'apps/web/e2e/fixtures.ts'), 'utf8');
    const condition = "message.type() === 'warning' || message.type() === 'error'";
    assert.ok(
      fixture.includes(condition),
      'Mutation must remove the real error recording condition',
    );
    writeFileSync(
      join(directory, 'fixtures.ts'),
      fixture.replace(condition, "message.type() === 'warning'"),
    );
    writeFileSync(
      join(directory, 'guard.cases.ts'),
      readFileSync(join(root, 'tooling/console-guard/guard.cases.ts'), 'utf8').replace(
        '../../apps/web/e2e/fixtures',
        './fixtures',
      ),
    );
    const config = join(directory, 'playwright.config.ts');
    writeFileSync(
      config,
      `import base from ${JSON.stringify(join(root, 'tooling/console-guard/playwright.config.ts'))};
export default { ...base, projects: base.projects.map(project => ({ ...project, testDir: import.meta.dirname })) };
`,
    );
    const mutant = runChild(config, join(directory, 'mutation-results'), [
      '--grep',
      'console\\.error',
    ]);
    assert.equal(mutant.cases.length, 1);
    assert.equal(mutant.child.status, 0);
    assert.equal(mutant.report.stats.expected, 1);
    assert.equal(mutant.cases[0].title, 'console.error');
    assert.throws(
      () => rejectViolation(mutant.cases[0], 'console.error: x'),
      /console.error must fail/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
