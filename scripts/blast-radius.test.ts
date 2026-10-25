/** @jest-environment node */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shapeBlastRadius } from './blast-radius.mjs';

const head = 'a'.repeat(40);
const button = 'packages/ui/src/Button.tsx';
const greeting = 'apps/web/src/routes/greeting/GreetingMessage.tsx';
// Trimmed Fallow 3.33.1 closures, without run-specific telemetry.
const greetingImporters = [
  'apps/web/index.html',
  'apps/web/src/App.tsx',
  'apps/web/src/main.tsx',
  'apps/web/src/routes/greeting/GreetingPage.test.tsx',
  'apps/web/src/routes/greeting/GreetingPage.tsx',
  'apps/web/src/routes/greeting/index.ts',
];
const buttonImporters = [...greetingImporters, 'apps/web/src/routes/greeting/GreetingForm.tsx'];
const trace = (seed: string, importers = buttonImporters) => ({
  kind: 'trace',
  seed,
  affected_not_shown: importers,
  coordination_gap: [{ consumer_file: 'apps/web/src/routes/greeting/GreetingForm.tsx' }],
});
const guard = {
  kind: 'guard',
  files: [button, greeting, ...buttonImporters].map((path) => ({
    path,
    zone: path === button ? { name: 'ui' } : null,
  })),
};
const input = {
  head,
  changed: [button],
  closures: { [button]: trace(button) },
  guard,
  tracked: new Set([button, greeting, ...buttonImporters]),
};

describe('shapeBlastRadius', () => {
  it('keeps the transitive importers and Fallow zones in deterministic evidence', () => {
    const evidence = shapeBlastRadius(input);
    expect(evidence).toMatchObject({ version: 1, head });
    expect(evidence.files).toEqual([
      {
        path: button,
        inGraph: true,
        importers: buttonImporters.toSorted(),
        consumers: ['apps/web/src/routes/greeting/GreetingForm.tsx'],
      },
    ]);
    expect(evidence.zones[button]).toBe('ui');
    expect(evidence.zones['apps/web/index.html']).toBeNull();
  });

  it('deduplicates overlapping closures, removes changed and untracked importers', () => {
    const evidence = shapeBlastRadius({
      ...input,
      changed: [greeting, button, button],
      closures: {
        [button]: trace(button, [...buttonImporters, greeting, 'untracked.ts', ...buttonImporters]),
        [greeting]: trace(greeting, [...greetingImporters, button]),
      },
    });
    expect(evidence.files.map((file: { path: string }) => file.path)).toEqual([greeting, button]);
    expect(evidence.files[0].importers).toEqual(greetingImporters);
    expect(evidence.files[1].importers).toEqual(buttonImporters.toSorted());
  });

  it('keeps an out-of-graph file, including a deletion, with no importers', () => {
    const path = 'deleted.ts';
    expect(
      shapeBlastRadius({
        ...input,
        changed: [path],
        closures: {
          [path]: {
            error: true,
            exit_code: 2,
            message: `file '${path}' not found in module graph`,
          },
        },
        guard: { kind: 'guard', files: [{ path, zone: null }] },
      }).files,
    ).toEqual([{ path, inGraph: false, importers: [], consumers: [] }]);
  });

  it.each([
    { error: true, message: 'analysis failed', exit_code: 2 },
    null,
    {},
    { ...trace(button), seed: greeting },
    { ...trace(button), affected_not_shown: [42] },
    { ...trace(button), coordination_gap: [{}] },
  ])('rejects failed or malformed closures: %j', (closure) => {
    expect(() => shapeBlastRadius({ ...input, closures: { [button]: closure } })).toThrow();
  });

  it.each([
    null,
    {},
    { kind: 'guard', files: [] },
    { ...guard, files: [{ path: button, zone: {} }] },
  ])('rejects malformed or incomplete zone evidence: %j', (value) =>
    expect(() => shapeBlastRadius({ ...input, guard: value })).toThrow());
});

it('collects the PR file list even when main already contains the same Unicode-path change', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blast-radius-diff-'));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Ben Sheridan-Edwards',
        '-c',
        'user.email=bensheridanedwards@gmail.com',
        ...args,
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  try {
    git('init', '-b', 'main');
    git('commit', '--allow-empty', '-m', 'initial');
    git('checkout', '-b', 'feature');
    writeFileSync(join(directory, 'café.txt'), 'same change');
    git('add', '.');
    git('commit', '-m', 'feature change');
    const head = git('rev-parse', 'HEAD');
    git('checkout', 'main');
    writeFileSync(join(directory, 'café.txt'), 'same change');
    git('add', '.');
    git('commit', '-m', 'independent main change');
    const merge = git('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-p', head, '-m', 'PR merge');
    git('checkout', '--detach', merge);
    const command = readFileSync('.github/workflows/ci.yml', 'utf8').match(
      /^ +changed="\$\(git .+$/m,
    )?.[0];
    expect(command).toBeDefined();
    const result = spawnSync('bash', ['-ec', `${command}\nprintf '%s' "$changed"`], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, HEAD_SHA: head },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('café.txt');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('--collect', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blast-radius-'));
  const output = join(directory, 'evidence.json');
  const collect = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['scripts/blast-radius.mjs', '--collect'], {
      encoding: 'utf8',
      env: { ...process.env, OUT: output, ...env },
    });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  afterEach(() => rmSync(output, { force: true }));

  it('writes every apps importer of Button plus showcase importers and its zone', () => {
    const result = collect({ CHANGED: button, HEAD_SHA: head });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const evidence = JSON.parse(readFileSync(output, 'utf8'));
    expect(evidence.head).toBe(head);
    expect(evidence.files[0].importers.filter((path: string) => path.startsWith('apps/'))).toEqual(
      buttonImporters.toSorted(),
    );
    expect(evidence.files[0].importers.some((path: string) => path.startsWith('showcase/'))).toBe(
      true,
    );
    expect(evidence.zones[button]).toBe('ui');
  }, 30_000);

  it('preserves the six route-private importers, including composition roots', () => {
    expect(collect({ CHANGED: greeting, HEAD_SHA: head }).status).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8')).files[0].importers).toEqual(greetingImporters);
  }, 30_000);

  it.each([
    'README.md',
    'deleted-blast-radius-file.ts',
  ])('writes an out-of-graph %s entry', (path) => {
    expect(collect({ CHANGED: path, HEAD_SHA: head }).status).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8')).files).toEqual([
      { path, inGraph: false, importers: [], consumers: [] },
    ]);
  }, 30_000);

  it('writes empty evidence for an explicitly empty diff', () => {
    expect(collect({ CHANGED: '', HEAD_SHA: head }).status).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      version: 1,
      head,
      files: [],
      zones: {},
    });
  });

  it.each([
    ['CHANGED', { HEAD_SHA: head }],
    ['HEAD_SHA', { CHANGED: button }],
  ] as const)('fails clearly without %s and removes stale evidence', (name, env) => {
    writeFileSync(output, 'stale evidence');
    const result = collect(env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(name);
    expect(existsSync(output)).toBe(false);
  });
});
