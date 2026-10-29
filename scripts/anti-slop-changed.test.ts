/** @jest-environment node */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts/anti-slop-changed.mjs');
const FINDING = 'Reflect.get(value, "name");\n';
const ERROR = 'Reflect.get(value, "id");\n';

const env = {
  ...process.env,
  PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}`,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

let directory: string;

function git(...args: string[]) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Ben Sheridan-Edwards',
      '-c',
      'user.email=bensheridanedwards@gmail.com',
      ...args,
    ],
    { cwd: directory, env, encoding: 'utf8' },
  );
}

function write(path: string, contents: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), contents);
}

function commit() {
  git('add', '-A');
  git('commit', '-qm', 'test: seed fixture');
}

function check(cwd = directory) {
  const result = spawnSync('node', [SCRIPT], { cwd, env, encoding: 'utf8' });

  if (result.error) throw result.error;

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'anti-slop-changed-'));

  const config = JSON.parse(readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8'));

  write(
    '.oxlintrc.json',
    JSON.stringify({
      ...config,
      jsPlugins: config.jsPlugins.map((path: string) => resolve(ROOT, path)),
    }),
  );
  write('anti-slop.advisory.mjs', readFileSync(join(ROOT, 'anti-slop.advisory.mjs'), 'utf8'));
  write('scripts/existing.ts', `${FINDING}\nexport const count = 1;\n`);
  git('init', '-q');
  commit();
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

it.each([
  'scripts/added.ts',
  'scripts/a space café.ts',
  '.github/added.ts',
  '.example.mjs',
])('reports a new finding in %s', (file) => {
  write(file, FINDING);
  commit();

  expect(check()).toMatchObject({
    status: 1,
    stdout: expect.stringContaining(`${file}:1 anti-slop(no-reflect-get) `),
    stderr: '',
  });
});

it('passes when only ignored files change', () => {
  write('vendor/example.ts', FINDING);
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('passes when a changed file only has a finding on an unchanged line', () => {
  write('scripts/existing.ts', `${FINDING}\nexport const count = 2;\n`);
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('filters unchanged errors even when oxlint exits one', () => {
  write('scripts/error.ts', `${ERROR}\nexport const count = 1;\n`);
  commit();
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  write('scripts/error.ts', `${ERROR}\nexport const count = 2;\n`);
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('uses added-line coordinates after an insertion shifts an old finding', () => {
  write('scripts/existing.ts', `export const first = 1;\n\n${FINDING}\nexport const count = 1;\n`);
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('ignores deletion-only hunks and deleted files', () => {
  write('scripts/existing.ts', FINDING);
  write('scripts/deleted.ts', FINDING);
  commit();
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('rm', 'scripts/deleted.ts');
  write('scripts/existing.ts', '');
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('reports a replacement line and works from a repository subdirectory', () => {
  write('scripts/existing.ts', `${FINDING}\n${ERROR}`);
  commit();

  expect(check(join(directory, 'scripts'))).toMatchObject({
    status: 1,
    stdout: expect.stringContaining('scripts/existing.ts:3 anti-slop(no-reflect-get) '),
    stderr: '',
  });
});

it('passes when there are no committed changes', () => {
  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('ignores existing findings when a file is renamed', () => {
  git('mv', 'scripts/existing.ts', 'scripts/renamed.ts');
  commit();

  expect(check()).toEqual({ status: 0, stdout: '', stderr: '' });
});

it('reports only added findings after a rename', () => {
  git('mv', 'scripts/existing.ts', 'scripts/renamed.ts');
  write('scripts/renamed.ts', `${FINDING}\nexport const count = 1;\n\n${ERROR}`);
  commit();

  expect(check()).toMatchObject({
    status: 1,
    stdout: expect.stringMatching(/^scripts\/renamed.ts:5 anti-slop\(no-reflect-get\) [^\n]+\n$/),
    stderr: '',
  });
});

it.each([false, true])('rejects uncommitted tracked content (staged: %s)', (staged) => {
  write('scripts/existing.ts', 'export const count = 2;\n');

  if (staged) git('add', 'scripts/existing.ts');

  expect(check()).toMatchObject({ status: 1, stderr: expect.stringContaining('Commit or stash') });
});

it('fails clearly when origin/main is missing', () => {
  git('update-ref', '-d', 'refs/remotes/origin/main');

  expect(check()).toMatchObject({ status: 1, stderr: expect.stringContaining('origin/main') });
});

it('fails clearly when the advisory configuration cannot load', () => {
  write('anti-slop.advisory.mjs', 'throw new Error("broken advisory config");\n');
  write('scripts/added.ts', FINDING);
  commit();

  expect(check()).toMatchObject({ status: 1, stderr: expect.stringContaining('oxlint') });
});
