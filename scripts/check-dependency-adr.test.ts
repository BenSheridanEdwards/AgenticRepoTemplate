/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findDependenciesWithoutAdr } from './check-dependency-adr.mjs';

const SCRIPT = join(process.cwd(), 'scripts/check-dependency-adr.mjs');
const ADR = '.agents/decisions/0018-adopt-zod.md';

const base = {
  dependencies: { react: '^19.1.0' },
  devDependencies: { jest: '^29.7.0' },
};

describe('findDependenciesWithoutAdr', () => {
  it('reports an added dependency without an ADR', () => {
    const headPackageJson = { ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [] }),
    ).toEqual(['zod']);
  });

  it('passes an added dependency that comes with a new ADR', () => {
    const headPackageJson = { ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [ADR] }),
    ).toEqual([]);
  });

  it('passes a version bump of an existing dependency', () => {
    const headPackageJson = { ...base, dependencies: { react: '^19.2.0' } };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [] }),
    ).toEqual([]);
  });

  it('passes a removed dependency', () => {
    const headPackageJson = { dependencies: base.dependencies };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [] }),
    ).toEqual([]);
  });

  it('reports added devDependencies, optionalDependencies, and peerDependencies', () => {
    const headPackageJson = {
      ...base,
      devDependencies: { ...base.devDependencies, vitest: '^3.0.0' },
      optionalDependencies: { fsevents: '^2.0.0' },
      peerDependencies: { 'react-dom': '^19.0.0' },
    };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [] }),
    ).toEqual(['vitest', 'fsevents', 'react-dom']);
  });

  it('does not report a dependency that only moved between sections', () => {
    const headPackageJson = { dependencies: base.dependencies, peerDependencies: { jest: '*' } };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [] }),
    ).toEqual([]);
  });

  it.each([
    '.agents/decisions/README.md',
    '.agents/decisions/18-adopt-zod.md',
    '.agents/decisions/0018-Adopt-Zod.md',
    'docs/decisions/0018-adopt-zod.md',
  ])('does not count %s as an ADR', (path) => {
    const headPackageJson = { ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } };
    expect(
      findDependenciesWithoutAdr({ basePackageJson: base, headPackageJson, addedPaths: [path] }),
    ).toEqual(['zod']);
  });
});

describe('check-dependency-adr CLI', () => {
  let directory: string;

  // Hooks export GIT_DIR, GIT_INDEX_FILE, and friends; they must not leak into
  // the scratch repository when this suite runs from a hook.
  const localEnvVars = execFileSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !localEnvVars.includes(key)),
  );
  delete env.GITHUB_BASE_REF;
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });

  function git(...args: string[]) {
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      { cwd: directory, env },
    );
  }

  function write(path: string, content: string) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  }

  function run(...args: string[]) {
    const result = spawnSync('node', [SCRIPT, ...args], { cwd: directory, env, encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'dependency-adr-'));
    git('init', '-q', '-b', 'main');
    write('package.json', JSON.stringify(base));
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('switch', '-q', '-c', 'feat/add-zod');
    write(
      'package.json',
      JSON.stringify({ ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } }),
    );
    git('commit', '-q', '-am', 'add zod');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('fails a new dependency without an ADR, naming it and the fix', () => {
    const { status, output } = run();
    expect(status).toBe(1);
    expect(output).toContain('zod');
    expect(output).toContain('.agents/decisions/NNNN-<slug>.md');
  });

  it('passes once the change adds an ADR', () => {
    write(ADR, '# 18. Adopt zod\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'adr');
    const { status, output } = run();
    expect(status).toBe(0);
    expect(output).toMatch(/OK/);
  });

  it('fails closed when the base ref cannot be resolved', () => {
    const { status, output } = run('origin/missing');
    expect(status).toBe(1);
    expect(output).toContain('git fetch origin');
  });

  it('compares against origin/$GITHUB_BASE_REF in a pull request', () => {
    const result = spawnSync('node', [SCRIPT], {
      cwd: directory,
      env: { ...env, GITHUB_BASE_REF: 'release' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"origin/release"');
  });
});
