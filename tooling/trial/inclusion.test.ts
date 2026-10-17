/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { listResults } from '../results.mjs';

/**
 * Proves a showcase result falls under every gate with no per-result entry:
 * a temporary copy of this checkout gains `showcase/x/`, a copy of the
 * reference greeting with renamed packages (never a Todo), and each gate's
 * real tool runs on it. The copy is committed on a branch off `main`, as in a
 * trial, so the gates that read commits see a real change.
 */
const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(REPOSITORY_ROOT, 'node_modules/.bin');
const PACKAGES_WITH_MODULES = ['apps/api', 'packages/ui'];
/**
 * The copy's node_modules are links into this checkout and its lockfile lacks
 * the showcase importers, so pnpm must never try to reinstall (and purge) them.
 */
const PNPM_IN_COPY = ['--config.verify-deps-before-run=false'];
const WEB_FILE = 'web/src/routes/greeting/GreetingPage.tsx';
const API_FILE = 'api/src/features/greeting/procedures.ts';

// Playwright refuses to run under a Jest worker's variables, and the copy's
// git must not see the outer repository's.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^(GIT|JEST)_/.test(key)),
);
Object.assign(env, {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  PATH: `${BIN}:${process.env.PATH}`,
  CI: '',
});

let copy: string;

function run(argv: string[]) {
  const ran = spawnSync(argv[0] as string, argv.slice(1), {
    cwd: copy,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: ran.status, output: `${ran.stdout}${ran.stderr}`, stdout: ran.stdout };
}

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: copy, env, encoding: 'utf8' }).trim();

/** Runs a root `package.json` script the way pnpm does: `sh -c` with the local binaries on the PATH. */
function script(name: string) {
  const scripts = JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8')).scripts;
  return run(['sh', '-c', scripts[name]]);
}

function write(path: string, text: string) {
  mkdirSync(dirname(join(copy, path)), { recursive: true });
  writeFileSync(join(copy, path), text);
}

/** Writes `files` into the copy for the length of `check`, then restores what was there. */
function withSeed<T>(files: Record<string, string>, check: () => T): T {
  const before = Object.fromEntries(
    Object.keys(files).map((path) => [
      path,
      existsSync(join(copy, path)) ? readFileSync(join(copy, path), 'utf8') : null,
    ]),
  );
  try {
    for (const [path, text] of Object.entries(files)) {
      write(path, text);
    }
    return check();
  } finally {
    for (const [path, text] of Object.entries(before)) {
      if (text === null) {
        unlinkSync(join(copy, path));
      } else {
        write(path, text);
      }
    }
  }
}

/** Commits `files` on a throwaway branch for the length of `check`, then returns to the result branch. */
function withCommittedSeed<T>(name: string, files: Record<string, string>, check: () => T): T {
  git('switch', '-q', '-c', `seed/${name}`);
  try {
    for (const [path, text] of Object.entries(files)) {
      write(path, text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', `seed ${name}`);
    return check();
  } finally {
    git('switch', '-q', '-f', 'result/x');
  }
}

/**
 * A web package's dependency links: every external package from the
 * reference web's own links, and each workspace package from `workspace`,
 * inside the copy, so Fallow resolves `@repo/ui` and the api within it.
 */
function linkWebModules(packagePath: string, workspace: Record<string, string>) {
  const source = join(REPOSITORY_ROOT, 'apps/web/node_modules');
  const target = join(copy, packagePath, 'node_modules');
  for (const entry of readdirSync(source)) {
    const names = entry.startsWith('@')
      ? readdirSync(join(source, entry)).map((name) => `${entry}/${name}`)
      : [entry];
    for (const name of names.filter((name) => !name.startsWith('@repo/'))) {
      mkdirSync(dirname(join(target, name)), { recursive: true });
      symlinkSync(realpathSync(join(source, name)), join(target, name));
    }
  }
  for (const [name, path] of Object.entries(workspace)) {
    mkdirSync(dirname(join(target, name)), { recursive: true });
    symlinkSync(join(copy, path), join(target, name));
  }
}

beforeAll(() => {
  copy = mkdtempSync(join(tmpdir(), 'showcase-inclusion-'));
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (path) => path && !path.startsWith('showcase/') && existsSync(join(REPOSITORY_ROOT, path)),
    );
  for (const path of files) {
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    copyFileSync(join(REPOSITORY_ROOT, path), join(copy, path));
  }
  symlinkSync(join(REPOSITORY_ROOT, 'node_modules'), join(copy, 'node_modules'));
  for (const path of PACKAGES_WITH_MODULES) {
    symlinkSync(join(REPOSITORY_ROOT, path, 'node_modules'), join(copy, path, 'node_modules'));
  }
  linkWebModules('apps/web', { '@repo/api': 'apps/api', '@repo/ui': 'packages/ui' });
  git('init', '-q', '-b', 'main');
  // `.gitignore` names `node_modules/`, which matches no symlink.
  writeFileSync(join(copy, '.git/info/exclude'), 'node_modules\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'scaffold');

  for (const path of files.filter((file) => /^apps\/(web|api)\//.test(file))) {
    write(
      path.replace(/^apps\//, 'showcase/x/'),
      readFileSync(join(REPOSITORY_ROOT, path), 'utf8')
        .replaceAll('@repo/web', '@x/web')
        .replaceAll('@repo/api', '@x/api'),
    );
  }
  symlinkSync(
    join(REPOSITORY_ROOT, 'apps/api/node_modules'),
    join(copy, 'showcase/x/api/node_modules'),
  );
  linkWebModules('showcase/x/web', { '@x/api': 'showcase/x/api', '@repo/ui': 'packages/ui' });
  git('switch', '-q', '-c', 'result/x');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat(showcase): add x');
});

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

describe('a showcase result', () => {
  it('is committed as source alone, with no dependency link tracked', () => {
    expect(git('ls-files', 'showcase/x').split('\n')).toContain(`showcase/x/${API_FILE}`);
    expect(
      git('ls-files')
        .split('\n')
        .filter((path) => path.includes('node_modules')),
    ).toEqual([]);
  });

  it('is a result with its own ports, so Playwright starts its servers', () => {
    expect(listResults(copy).map(({ id, root, ports }) => ({ id, root, ports }))).toEqual([
      { id: 'reference', root: 'apps', ports: { web: 5173, api: 3001 } },
      { id: 'x', root: 'showcase/x', ports: { web: 5183, api: 3011 } },
    ]);
  });

  it('runs its own e2e specs and the fixed acceptance spec in Playwright', () => {
    const listed = run(['playwright', 'test', '--list']);

    expect(listed).toMatchObject({ code: 0 });
    expect(listed.output).toMatch(/\[x\] › showcase\/x\/web\/e2e\/greeting\.spec\.ts/);
    expect(listed.output).toMatch(/\[x-acceptance\] › tooling\/trial\/acceptance\/todo\.spec\.ts/);
  });

  it('is a workspace package that pnpm builds', () => {
    const listed = run(['pnpm', ...PNPM_IN_COPY, '-r', 'ls', '--depth', '-1', '--json']);
    const built = run(['pnpm', ...PNPM_IN_COPY, '--filter', '@x/web', 'build']);

    expect(JSON.parse(listed.stdout).map(({ name }: { name: string }) => name)).toEqual(
      expect.arrayContaining(['@x/web', '@x/api']),
    );
    expect(built.code).toBe(0);
    expect(existsSync(join(copy, 'showcase/x/web/dist/index.html'))).toBe(true);
  });

  it('gets the same ESLint config as the reference, with every policy rule on', () => {
    const configOf = (path: string) =>
      JSON.parse(run(['eslint', '--print-config', path]).stdout).rules as Record<string, unknown>;

    for (const file of [WEB_FILE, API_FILE]) {
      const showcase = configOf(`showcase/x/${file}`);
      const policy = Object.entries(showcase).filter(([rule]) => rule.startsWith('policy/'));

      expect(showcase).toEqual(configOf(`apps/${file}`));
      expect(policy.length).toBeGreaterThan(5);
      expect(policy.filter(([, setting]) => JSON.stringify(setting) !== '[2]')).toEqual([]);
    }
  });

  it('fails ESLint policy on a seeded violation and on nothing else', () => {
    const linted = withSeed(
      {
        'showcase/x/web/src/routes/greeting/One.tsx':
          'export function One() {\n  return <p>one</p>;\n}\n\nexport function Two() {\n  return <p>two</p>;\n}\n',
      },
      () => run(['eslint', '--max-warnings=0', '--format', 'json', 'showcase/x']),
    );
    const findings = JSON.parse(linted.stdout).flatMap(
      ({ filePath, messages }: { filePath: string; messages: { ruleId: string }[] }) =>
        messages.map(({ ruleId }) => `${filePath.slice(copy.length + 1)} ${ruleId}`),
    );

    expect(linted.code).toBe(1);
    expect(findings).toEqual([
      'showcase/x/web/src/routes/greeting/One.tsx policy/one-component-per-file',
    ]);
  });

  it('is a project React Doctor scans', () => {
    const scanned = run([
      'react-doctor',
      '.',
      '--no-lint',
      '--no-supply-chain',
      '--no-telemetry',
      '--yes',
    ]);

    expect(scanned.output).toMatch(/Select projects › [^\n]*@x\/web/);
  });

  it('fails the suppression check on a committed suppression with no reason', () => {
    const file = `showcase/x/${API_FILE}`;
    const checked = withCommittedSeed(
      'suppression',
      { [file]: `// @ts-ignore\n${readFileSync(join(copy, file), 'utf8')}` },
      () => run(['node', 'scripts/check-suppressions.mjs']),
    );

    expect(checked.code).toBe(1);
    expect(checked.output).toContain(file);
  });

  it('fails the Biome naming override on a seeded file name', () => {
    const linted = withSeed(
      { 'showcase/x/web/src/routes/greeting/bad_name.ts': 'export {};\n' },
      () => run(['biome', 'lint', 'showcase/x']),
    );

    expect(linted.code).toBe(1);
    expect(linted.output).toContain('useFilenamingConvention');
    expect(linted.output).toContain('bad_name.ts');
  });

  it('is in every TypeScript program that covers its kind of file', () => {
    const filesOf = (config: string) =>
      run(['tsc', '-p', config, '--listFilesOnly'])
        .stdout.split('\n')
        .filter((path) => path.includes('/showcase/x/'))
        .map((path) => path.slice(path.indexOf('showcase/x/')));

    expect(filesOf('tsconfig.json')).toContain(`showcase/x/${WEB_FILE}`);
    expect(filesOf('tsconfig.api.json')).toContain(`showcase/x/${API_FILE}`);
    expect(filesOf('tsconfig.node.json')).toEqual(
      expect.arrayContaining([
        'showcase/x/web/e2e/greeting.spec.ts',
        'showcase/x/web/vite.config.ts',
      ]),
    );
    expect(filesOf('tsconfig.domain.json')).toEqual([
      'showcase/x/api/src/features/greeting/domain.ts',
    ]);
  });

  it('fails the api type check on a seeded extensionless import, and on nothing else', () => {
    const checked = withSeed(
      {
        'showcase/x/api/src/features/greeting/seed.ts': "export { greet } from './application';\n",
      },
      () => run(['tsc', '-p', 'tsconfig.api.json', '--noEmit']),
    );
    const errors = checked.stdout.split('\n').filter((line) => line.includes('error TS'));

    expect(checked.code).toBe(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^showcase\/x\/api\/src\/features\/greeting\/seed\.ts.*error TS2835/);
  });

  it('runs its unit tests in the web and api projects and is held to coverage on its own', () => {
    const listed = run(['jest', '--listTests', '--selectProjects', 'web', 'api']);
    const covered = run([
      'sh',
      '-c',
      'jest --coverage --selectProjects web api && node tooling/coverage-by-result.mjs',
    ]);
    const summary = JSON.parse(readFileSync(join(copy, 'coverage/coverage-summary.json'), 'utf8'));

    expect(listed.output).toContain(`${copy}/showcase/x/web/src/routes/greeting/`);
    expect(listed.output).toContain(`${copy}/showcase/x/api/src/features/greeting/`);
    expect(covered.code).toBe(0);
    expect(Object.keys(summary)).toContain(join(copy, `showcase/x/${API_FILE}`));
    expect(covered.output).toContain('Coverage per result is at 80% or more: reference, x');
  });

  it('passes the architecture gate as a copy of the reference', () => {
    const diagrams = script('arch:diagram');
    const gate = script('arch:gate');

    expect(diagrams).toMatchObject({ code: 0 });
    expect(run(['git', 'diff', '--exit-code', 'docs/architecture/roles.mmd'])).toMatchObject({
      code: 0,
    });
    expect(gate).toMatchObject({ code: 0 });
  });

  it.each([
    [
      'a value import of its api router in its api client',
      {
        'showcase/x/web/src/api-client/seed.ts':
          "import { appRouter } from '@x/api';\nexport const seed = appRouter;\n",
      },
      'boundary',
    ],
    [
      'a source file in no role',
      { 'showcase/x/web/src/utils/format.ts': 'export const format = String;\n' },
      'showcase/x/web/src/utils/format.ts',
    ],
  ])('fails the architecture gate on %s', (_case, seed, reported) => {
    const gate = withSeed(seed, () => run(['fallow', 'architecture', '-q']));

    expect(gate.code).not.toBe(0);
    expect(gate.output).toContain(reported);
  });

  it('passes the commit gates that read the change against main', () => {
    expect(run(['node', 'scripts/check-dependency-adr.mjs', 'main']).code).toBe(0);
    expect(run(['fallow', 'audit', '--base', 'main']).code).toBe(0);
  });

  it('fails the dependency ADR check on a dependency no ADR names', () => {
    const manifest = JSON.parse(readFileSync(join(copy, 'showcase/x/web/package.json'), 'utf8'));
    manifest.dependencies.lodash = '^4.17.21';

    const checked = withCommittedSeed(
      'lodash',
      { 'showcase/x/web/package.json': `${JSON.stringify(manifest, null, 2)}\n` },
      () => run(['node', 'scripts/check-dependency-adr.mjs', 'main']),
    );

    expect(checked.code).toBe(1);
    expect(checked.output).toContain('lodash');
  });

  it('fails the Fallow audit on a committed dead export', () => {
    const domain = 'showcase/x/api/src/features/greeting/domain.ts';
    const audited = withCommittedSeed(
      'dead-export',
      {
        [domain]: `${readFileSync(join(copy, domain), 'utf8')}export const unusedSeed = 1;\n`,
      },
      () => run(['fallow', 'audit', '--base', 'main']),
    );

    expect(audited.code).toBe(1);
    expect(audited.output).toContain('unusedSeed');
  });
});
