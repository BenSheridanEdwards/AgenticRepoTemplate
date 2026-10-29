/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { coverageShortfalls } from './coverage-by-result.mjs';
import { listResults } from './results.mjs';

const CLI = resolve(import.meta.dirname, 'coverage-by-result.mjs');

const metric = (covered: number, total: number) => ({
  total,
  covered,
  skipped: 0,
  pct: total === 0 ? 100 : (covered / total) * 100,
});
const file = (covered: number, total: number) => ({
  lines: metric(covered, total),
  statements: metric(covered, total),
  functions: metric(covered, total),
  branches: metric(covered, total),
});

let root: string;

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

beforeEach(() => {
  // Match the physical paths Jest reports and the CLI gets from process.cwd().
  root = realpathSync(mkdtempSync(join(tmpdir(), 'coverage-by-result-')));
  ['apps', 'showcase/todo-01'].forEach((result) => {
    write(`${result}/web/package.json`, '{}\n');
    write(`${result}/api/package.json`, '{}\n');
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A summary where the reference is fully covered and todo-01 has `covered` of 10 in each metric. */
const summary = (covered: number) => ({
  total: file(100 + covered, 110),
  [join(root, 'apps/web/src/routes/greeting/GreetingPage.tsx')]: file(60, 60),
  [join(root, 'apps/api/src/features/greeting/domain.ts')]: file(40, 40),
  [join(root, 'packages/ui/src/Button.tsx')]: file(0, 0),
  [join(root, 'showcase/todo-01/web/src/routes/todos/TodosPage.tsx')]: file(covered, 6),
  [join(root, 'showcase/todo-01/api/src/features/todos/domain.ts')]: file(0, 4),
});

describe('coverageShortfalls', () => {
  it('passes when every result is at 80 percent or more in each metric', () => {
    expect(coverageShortfalls(summary(8), listResults(root), root)).toEqual([]);
  });

  it('names the result and metric under 80 percent even when the global total passes', () => {
    const shortfalls = coverageShortfalls(summary(6), listResults(root), root);

    expect(shortfalls).toEqual([
      'todo-01: lines 60.00% < 80%',
      'todo-01: statements 60.00% < 80%',
      'todo-01: functions 60.00% < 80%',
      'todo-01: branches 60.00% < 80%',
    ]);
  });

  it('compares the percentage Jest reports, floored to two decimals', () => {
    const justUnder = {
      [join(root, 'apps/web/src/App.tsx')]: file(5, 5),
      [join(root, 'showcase/todo-01/web/src/main.ts')]: file(79_999, 100_000),
    };

    expect(coverageShortfalls(justUnder, listResults(root), root)).toEqual(
      ['lines', 'statements', 'functions', 'branches'].map(
        (name) => `todo-01: ${name} 79.99% < 80%`,
      ),
    );
  });

  it('counts a metric with nothing to cover as covered', () => {
    const empty = {
      [join(root, 'apps/web/src/main.ts')]: file(0, 0),
      [join(root, 'showcase/todo-01/web/src/main.ts')]: file(0, 0),
    };

    expect(coverageShortfalls(empty, listResults(root), root)).toEqual([]);
  });

  it('fails a result with no covered source at all', () => {
    const referenceOnly = { [join(root, 'apps/web/src/App.tsx')]: file(5, 5) };

    expect(coverageShortfalls(referenceOnly, listResults(root), root)).toEqual([
      'todo-01: no source file in the coverage summary',
    ]);
  });
});

describe('the coverage-by-result CLI', () => {
  const run = () => spawnSync(process.execPath, [CLI], { cwd: root, encoding: 'utf8' });

  it('exits 0 and prints each result when all pass', () => {
    write('coverage/coverage-summary.json', JSON.stringify(summary(10)));

    const passed = run();

    expect(passed.status).toBe(0);
    expect(passed.stdout).toContain('reference');
    expect(passed.stdout).toContain('todo-01');
  });

  it('exits 1 naming the result under the threshold', () => {
    write('coverage/coverage-summary.json', JSON.stringify(summary(2)));

    const failed = run();

    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('todo-01: lines 20.00% < 80%');
  });

  it('exits 1 when there is no coverage summary', () => {
    const missing = run();

    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('coverage/coverage-summary.json');
  });
});
