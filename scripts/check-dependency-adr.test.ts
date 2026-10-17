/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findDependenciesWithoutAdr, workspaceManifestPaths } from './check-dependency-adr.mjs';

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
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [],
      }),
    ).toEqual(['zod']);
  });

  it('passes an added dependency that comes with a new ADR', () => {
    const headPackageJson = { ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } };
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [{ path: ADR, text: '# 18. Adopt zod' }],
      }),
    ).toEqual([]);
  });

  it('reports a new dependency that the added ADR never names', () => {
    const headPackageJson = { ...base, dependencies: { ...base.dependencies, zod: '^3.0.0' } };
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [{ path: ADR, text: '# 18. Adopt valibot' }],
      }),
    ).toEqual(['zod']);
  });

  it('passes a version bump of an existing dependency', () => {
    const headPackageJson = { ...base, dependencies: { react: '^19.2.0' } };
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [],
      }),
    ).toEqual([]);
  });

  it('passes a removed dependency', () => {
    const headPackageJson = { dependencies: base.dependencies };
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [],
      }),
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
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [],
      }),
    ).toEqual(['vitest', 'fsevents', 'react-dom']);
  });

  it('does not report a dependency that only moved between sections', () => {
    const headPackageJson = { dependencies: base.dependencies, peerDependencies: { jest: '*' } };
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [],
      }),
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
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [headPackageJson],
        addedAdrs: [{ path, text: '# Adopt zod' }],
      }),
    ).toEqual(['zod']);
  });
});

describe('findDependenciesWithoutAdr across workspace manifests', () => {
  const root = { devDependencies: { jest: '^29.7.0' } };
  const web = { name: '@repo/web', dependencies: { react: '^19.1.0' } };

  it('passes a dependency that moved from the root manifest to a workspace package', () => {
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [root, web],
        addedAdrs: [],
      }),
    ).toEqual([]);
  });

  it('reports a new name that only a workspace package lists', () => {
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [base],
        headManifests: [root, { ...web, dependencies: { ...web.dependencies, lodash: '^4.0.0' } }],
        addedAdrs: [],
      }),
    ).toEqual(['lodash']);
  });

  it('passes a version bump inside a workspace package', () => {
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [root, web],
        headManifests: [root, { ...web, dependencies: { react: '^19.2.0' } }],
        addedAdrs: [],
      }),
    ).toEqual([]);
  });

  it('passes a workspace: reference to another package in the workspace', () => {
    expect(
      findDependenciesWithoutAdr({
        baseManifests: [root, web],
        headManifests: [
          root,
          { ...web, dependencies: { ...web.dependencies, '@x/api': 'workspace:*' } },
        ],
        addedAdrs: [],
      }),
    ).toEqual([]);
  });
});

describe('workspaceManifestPaths', () => {
  const tracked = [
    'package.json',
    'apps/web/package.json',
    'apps/web/src/App.tsx',
    'apps/web/src/nested/package.json',
    'packages/ui/package.json',
    'vendor/braces/package.json',
  ];

  it('lists only the root manifest without a workspace file', () => {
    expect(workspaceManifestPaths(null, tracked)).toEqual(['package.json']);
  });

  it('lists only the root manifest when the workspace file has no packages', () => {
    expect(workspaceManifestPaths('allowBuilds:\n  esbuild: true\n', tracked)).toEqual([
      'package.json',
    ]);
  });

  it('adds each package.json one level under a listed glob, and nothing else', () => {
    const yaml = [
      '# settings',
      'packages:',
      "  - 'apps/*'",
      '  - packages/*  # the shared kit',
      '',
      'allowBuilds:',
      '  esbuild: true',
    ].join('\n');
    expect(workspaceManifestPaths(yaml, tracked)).toEqual([
      'package.json',
      'apps/web/package.json',
      'packages/ui/package.json',
    ]);
  });

  it('honours a negated glob', () => {
    const yaml = 'packages:\n  - "apps/*"\n  - "packages/*"\n  - "!packages/ui"\n';
    expect(workspaceManifestPaths(yaml, tracked)).toEqual([
      'package.json',
      'apps/web/package.json',
    ]);
  });

  it('reads unindented items and items after a comment line', () => {
    const yaml =
      "packages:\n- 'apps/*'\n# the shared kit\n\n- packages/*\nallowBuilds:\n  esbuild: true\n";
    expect(workspaceManifestPaths(yaml, tracked)).toEqual([
      'package.json',
      'apps/web/package.json',
      'packages/ui/package.json',
    ]);
  });

  it('reads a glob written with a leading ./', () => {
    expect(workspaceManifestPaths("packages:\n  - './apps/*'\n", tracked)).toEqual([
      'package.json',
      'apps/web/package.json',
    ]);
  });

  it('fails closed on a packages key with no globs', () => {
    expect(() => workspaceManifestPaths('packages:\nallowBuilds: {}\n', tracked)).toThrow(
      /packages/,
    );
  });

  it('fails closed on a list item it cannot read', () => {
    expect(() => workspaceManifestPaths("packages:\n  - { path: 'apps/*' }\n", tracked)).toThrow(
      /packages/,
    );
  });

  it('fails closed on a packages list it cannot read', () => {
    expect(() => workspaceManifestPaths("packages: ['apps/*']\n", tracked)).toThrow(/packages/);
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

  it('reads the committed package.json, not uncommitted edits', () => {
    write(ADR, '# 18. Adopt zod\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'adr');
    write(
      'package.json',
      JSON.stringify({ ...base, dependencies: { ...base.dependencies, zod: '^3.0.0', ky: '1' } }),
    );
    expect(run().status).toBe(0);
  });

  it('fails closed when the base ref cannot be resolved', () => {
    const { status, output } = run('origin/missing');
    expect(status).toBe(1);
    expect(output).toContain('git fetch origin');
  });

  it('fails a new dependency that only a workspace package manifest lists', () => {
    write(ADR, '# 18. Adopt zod\n');
    write('pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n");
    write('apps/web/package.json', JSON.stringify({ dependencies: { lodash: '^4.0.0' } }));
    git('add', '-A');
    git('commit', '-q', '-m', 'workspace');
    const { status, output } = run();
    expect(status).toBe(1);
    expect(output).toContain('lodash');
    expect(output).not.toContain('zod');
  });

  it('passes a dependency that moves from the root manifest into a workspace package', () => {
    write(ADR, '# 18. Adopt zod\n');
    write('pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n");
    write('package.json', JSON.stringify({ devDependencies: base.devDependencies }));
    write(
      'apps/web/package.json',
      JSON.stringify({ dependencies: { ...base.dependencies, zod: '^3.0.0' } }),
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'workspace');
    expect(run().status).toBe(0);
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
