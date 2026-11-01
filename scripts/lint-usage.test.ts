/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBiome, parseOxlint, record, runCli } from './lint-usage.mjs';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      `scripts/fixtures/lint-usage/${name === 'biome' ? 'biome-report' : name}.json`,
      'utf8',
    ),
  );
const git = (...args: string[]) =>
  args[0] === 'write-tree' ? 'staged-tree' : args[0] === 'symbolic-ref' ? 'feat/example' : 'head';
const options = () => ({
  exitCode: 1,
  env: {},
  git,
  run: (tool: string) => JSON.stringify(fixture(tool)),
  append: jest.fn(),
  now: () => new Date('2026-11-01T15:00:00Z'),
});

test('groups reporter diagnostics by rule and unique file', () => {
  expect(parseBiome(fixture('biome'))).toEqual({
    tool: 'biome',
    total: 3,
    rules: {
      'lint/suspicious/noDebugger': { count: 2, files: ['scripts/example.ts'] },
      format: { count: 1, files: ['scripts/other.ts'] },
    },
  });
  expect(parseOxlint(fixture('oxlint'))).toEqual({
    tool: 'oxlint',
    total: 2,
    rules: {
      'anti-slop(require-safety-comment-for-type-assertion)': {
        count: 2,
        files: ['scripts/example.ts', 'scripts/other.ts'],
      },
    },
  });
  [parseBiome, parseOxlint].forEach((parse) => {
    expect(parse({ diagnostics: [] })).toMatchObject({ total: 0, rules: {} });
  });
});

test('appends exactly one complete record for a failing hook', () => {
  const input = options();
  record(input);
  expect(input.append).toHaveBeenCalledTimes(1);
  const line = input.append.mock.calls[0]?.[0];
  expect(line.split('\n')).toHaveLength(2);
  expect(JSON.parse(line)).toEqual({
    schema: 1,
    timestamp: '2026-11-01T15:00:00.000Z',
    branch: 'feat/example',
    attempt: 'staged-tree',
    head: 'head',
    agent: null,
    model: null,
    passed: false,
    hookExitCode: 1,
    tools: [parseBiome(fixture('biome')), parseOxlint(fixture('oxlint'))],
    total: 5,
  });
});

test('records explicit agent metadata and an unborn HEAD', () => {
  const input = options();
  record({
    ...input,
    exitCode: 0,
    env: { CODEX_THREAD_ID: 'session', CODEX_MODEL: 'explicit-model' },
    git: (...args: string[]) => {
      if (args[0] === 'rev-parse') throw new Error('unborn');
      return git(...args);
    },
  });
  expect(JSON.parse(input.append.mock.calls[0]?.[0])).toMatchObject({
    passed: true,
    head: null,
    agent: 'codex',
    model: 'explicit-model',
  });
});

test('CLI preserves successful exit even when reporting or appending fails', () => {
  ['run', 'append'].forEach((failure) => {
    const input = options();
    expect(
      runCli(['--hook-exit', '1'], {
        ...input,
        [failure]: () => {
          throw new Error('broken');
        },
      }),
    ).toBe(0);
  });
  const input = options();
  expect(runCli(['--hook-exit', '1'], { ...input, env: { FACTORY_USAGE_LOG: '0' } })).toBe(0);
  expect(input.append).not.toHaveBeenCalled();
});

test('real hook retains its failure and logs both linters, then passes after repair', () => {
  mkdirSync('.scratch', { recursive: true });
  const folder = mkdtempSync(join(process.cwd(), '.scratch/lint-usage-'));
  const command = (file: string, args: string[]) =>
    spawnSync(file, args, { cwd: folder, encoding: 'utf8', env: process.env });
  const source = (path: string) => readFileSync(path, 'utf8');
  mkdirSync(join(folder, 'scripts'));
  mkdirSync(join(folder, '.husky'));
  ['biome.json', '.oxlintrc.json'].forEach((file) => {
    writeFileSync(join(folder, file), source(file));
  });
  symlinkSync(join(process.cwd(), 'node_modules'), join(folder, 'node_modules'));
  symlinkSync(join(process.cwd(), 'vendor'), join(folder, 'vendor'));
  writeFileSync(join(folder, 'scripts/lint-usage.mjs'), source('scripts/lint-usage.mjs'));
  writeFileSync(join(folder, '.husky/pre-commit'), source('.husky/pre-commit'));
  const scripts = JSON.parse(source('package.json')).scripts;
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node -e "process.exit(0)"',
        'lint:anti-slop': scripts['lint:anti-slop'],
        'fallow:audit': 'node -e "process.exit(0)"',
        'secret-scan': 'node -e "process.exit(0)"',
      },
    }),
  );
  command('git', ['init']);
  writeFileSync(join(folder, '.gitignore'), 'node_modules\nvendor\n.cache\n');
  writeFileSync(join(folder, 'scripts/bad.ts'), 'debugger;\n');
  writeFileSync(join(folder, 'scripts/assertion.ts'), 'export const value = 1 as number;\n');
  command('git', ['add', '.']);
  const original = command('pnpm', [
    'exec',
    'biome',
    'check',
    '--error-on-warnings',
    '--staged',
    '--no-errors-on-unmatched',
    '.',
  ]);
  const failed = command('sh', ['.husky/pre-commit']);
  expect(failed.status).toBe(original.status);
  expect(failed.status).not.toBe(0);
  const log = join(folder, '.cache/factory-usage/lint-runs.jsonl');
  const lines = readFileSync(log, 'utf8').trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('lint/suspicious/noDebugger');
  expect(lines[0]).toContain('require-safety-comment-for-type-assertion');
  expect(JSON.parse(lines[0] ?? '').passed).toBe(false);
  writeFileSync(join(folder, 'scripts/bad.ts'), 'export const answer = 42;\n');
  writeFileSync(join(folder, 'scripts/assertion.ts'), 'export const value = 1;\n');
  command('pnpm', ['exec', 'biome', 'check', '--write', '.']);
  command('git', ['add', '.']);
  const passed = command('sh', ['.husky/pre-commit']);
  expect(passed.status).toBe(0);
  const records = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(records).toHaveLength(2);
  expect(records[1]).toMatchObject({ passed: true, hookExitCode: 0, total: 0 });
}, 30000);
