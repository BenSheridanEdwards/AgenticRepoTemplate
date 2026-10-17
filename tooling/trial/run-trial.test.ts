/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { validateEvidence } from './evidence.mjs';
import { planTrial, renderPrompt, runTrial, systemDeps } from './run-trial.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
const CLI = join(REPOSITORY_ROOT, 'tooling/trial/run-trial.mjs');
const BIOME = join(REPOSITORY_ROOT, 'node_modules/.bin/biome');
const SIGN_OFF = 'Signed-off-by: Ben Sheridan-Edwards <bensheridanedwards@gmail.com>';
const TEMPLATE = '# Todo trial {{ID}}\n\nYou are running trial {{N}} of three.\n';
const LOCKFILE = [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    devDependencies: {}',
  '',
  '  apps/web:',
  '    dependencies: {}',
  '',
  'packages: {}',
  '',
].join('\n');

const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
Object.assign(gitEnv, {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
});
const savedEnv = { ...process.env };

let sandbox: string;
let source: string;
let scaffold: string;
let failingHookScaffold: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim();

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * A fake `claude`: prints a version, records the argv and stdin it got next to
 * itself, prints a stream-json session, then runs `body` in the clone.
 */
function fakeAgent(name: string, body: string, exitCode = 0) {
  const path = join(sandbox, `${name}.mjs`);
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const argv = process.argv.slice(2);
if (argv[0] === '--version') { console.log('fake-agent 1.0.0'); process.exit(0); }
const stdin = readFileSync(0, 'utf8');
writeFileSync(${JSON.stringify(`${path}.call.json`)}, JSON.stringify({ argv, stdin, cwd: process.cwd() }));
const session = argv[argv.indexOf('--session-id') + 1];
const emit = (event) => console.log(JSON.stringify(event));
const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
emit({ type: 'system', subtype: 'init', session_id: session, model: 'claude-opus-fake' });
${body}
emit({ type: 'result', subtype: 'success', session_id: session, num_turns: 3, total_cost_usd: 0.25 });
process.exit(${exitCode});
`,
  );
  chmodSync(path, 0o755);
  return path;
}

const lastCall = (agent: string) =>
  JSON.parse(readFileSync(`${agent}.call.json`, 'utf8')) as {
    argv: string[];
    stdin: string;
    cwd: string;
  };

const WRITES_RESULT = "put('showcase/todo-01/web/src/main.tsx', 'export {};\\n');";

const quietDeps = (overrides: Partial<ReturnType<typeof systemDeps>> = {}) => ({
  ...systemDeps(),
  freeDiskBytes: () => 100e9,
  isPortBusy: async () => false,
  ...overrides,
});

const passingCheck = { name: 'verify', argv: ['node', '-e', 'process.exit(0)'], timeoutMs: 30_000 };

function plan(options: { agent: string; trial?: number; scaffoldRev?: string; retry?: boolean }) {
  const trialsRoot = join(sandbox, `trials-${Math.random().toString(16).slice(2)}`);
  mkdirSync(trialsRoot);
  return {
    ...planTrial({
      trial: options.trial ?? 1,
      scaffoldRev: options.scaffoldRev ?? scaffold,
      root: source,
      trialsRoot,
      now: new Date('2026-10-17T12:00:00Z'),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      agentCommand: options.agent,
      claudeConfigDir: join(sandbox, 'claude-config'),
      readRoots: [],
      retry: options.retry ?? false,
    }),
    setup: [
      {
        name: 'install',
        argv: ['git', 'config', 'core.hooksPath', '.githooks'],
        timeoutMs: 30_000,
      },
    ],
    checks: [passingCheck],
  };
}

const readEvidence = (id = 'todo-01') =>
  JSON.parse(readFileSync(join(source, `docs/trials/${id}.json`), 'utf8'));

function clearEvidence() {
  rmSync(join(source, 'docs/trials'), { recursive: true, force: true });
}

beforeAll(() => {
  Object.assign(process.env, gitEnv);
  sandbox = mkdtempSync(join(tmpdir(), 'run-trial-'));
  source = join(sandbox, 'source');
  mkdirSync(source);
  write(sandbox, 'claude-config/settings.json', '{ "model": "opus" }\n');
  git(source, 'init', '-q', '-b', 'main');
  write(source, 'tooling/trial/todo-prompt.md', TEMPLATE);
  write(source, 'pnpm-lock.yaml', LOCKFILE);
  write(source, 'apps/web/src/App.tsx', 'export const App = 1;\n');
  write(source, '.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
  chmodSync(join(source, '.githooks/pre-commit'), 0o755);
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'scaffold');
  scaffold = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '-q', '-b', 'trial/todo-09');
  write(source, 'showcase/todo-09/web/package.json', '{}\n');
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'an earlier result');
  git(source, 'checkout', '-q', 'main');
  write(source, '.githooks/pre-commit', '#!/bin/sh\necho "hook says no" >&2\nexit 1\n');
  git(source, 'commit', '-q', '-am', 'a scaffold whose hook fails');
  failingHookScaffold = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '-q', scaffold);
});

afterAll(() => {
  process.env = savedEnv;
  rmSync(sandbox, { recursive: true, force: true });
});

afterEach(clearEvidence);

describe('planTrial', () => {
  it('names the workdir, clone, branch and evidence paths from the trial number', () => {
    const planned = planTrial({
      trial: 2,
      scaffoldRev: 'c'.repeat(40),
      root: '/repo',
      trialsRoot: '/trials',
      now: new Date('2026-10-17T12:34:56.789Z'),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      claudeConfigDir: '/home/me/.claude',
      readRoots: [],
      retry: false,
    });

    expect(planned).toMatchObject({
      trial: 2,
      id: 'todo-02',
      branch: 'trial/todo-02',
      workdir: '/trials/todo-02-20261017T123456Z',
      clone: '/trials/todo-02-20261017T123456Z/repo',
      evidencePath: '/repo/docs/trials/todo-02.json',
      patchPath: '/repo/docs/trials/todo-02.patch',
      fake: false,
    });
  });

  it('runs exactly the brief command plus the evidence flags, with a fresh session id and no resume', () => {
    const planned = planTrial({
      trial: 1,
      scaffoldRev: 'c'.repeat(40),
      root: '/repo',
      trialsRoot: '/trials',
      now: new Date(),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      claudeConfigDir: '/home/me/.claude',
      readRoots: [],
      retry: false,
    });

    expect(planned.agentArgv).toEqual([
      'claude',
      '-p',
      '--model',
      'opus',
      '--permission-mode',
      'bypassPermissions',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
    ]);
    for (const flag of ['--resume', '-r', '--continue', '-c']) {
      expect(planned.agentArgv).not.toContain(flag);
    }
  });

  it('swaps only the executable for a fake agent and marks the plan fake', () => {
    const planned = planTrial({
      trial: 3,
      scaffoldRev: 'c'.repeat(40),
      root: '/repo',
      trialsRoot: '/trials',
      now: new Date(),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      agentCommand: '/fakes/agent.mjs',
      claudeConfigDir: '/home/me/.claude',
      readRoots: [],
      retry: false,
    });

    expect(planned.agentArgv[0]).toBe('/fakes/agent.mjs');
    expect(planned.agentArgv.slice(1)).toContain('bypassPermissions');
    expect(planned.fake).toBe(true);
  });

  it.each([
    ['trial 4', { trial: 4 }, '--trial'],
    ['trial 0', { trial: 0 }, '--trial'],
    ['a short scaffold rev', { scaffoldRev: 'abc123' }, '--scaffold'],
  ])('rejects %s', (_case, override, flag) => {
    expect(() =>
      planTrial({
        trial: 1,
        scaffoldRev: 'c'.repeat(40),
        root: '/repo',
        trialsRoot: '/trials',
        now: new Date(),
        sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
        claudeConfigDir: '/home/me/.claude',
        readRoots: [],
        retry: false,
        ...override,
      }),
    ).toThrow(flag);
  });
});

describe('renderPrompt', () => {
  it('fills the committed template with the trial id and number', () => {
    const template = readFileSync(join(REPOSITORY_ROOT, 'tooling/trial/todo-prompt.md'), 'utf8');
    const planned = { id: 'todo-02', trial: 2 } as Parameters<typeof renderPrompt>[1];

    expect(renderPrompt(template, planned)).toBe(
      template.replaceAll('{{ID}}', 'todo-02').replaceAll('{{N}}', '2'),
    );
    expect(renderPrompt(template, planned)).toContain('`showcase/todo-02/`');
  });

  it('throws on a placeholder it does not fill', () => {
    expect(() =>
      renderPrompt('Trial {{ID}} on {{DATE}}', { id: 'todo-01', trial: 1 } as never),
    ).toThrow('{{DATE}}');
  });
});

describe('runTrial', () => {
  it('runs the agent once in a fresh blobless clone at the scaffold, commits its result and writes passing evidence', async () => {
    const agent = fakeAgent('passing', WRITES_RESULT);
    const planned = plan({ agent });

    const evidence = await runTrial(planned, quietDeps());

    const call = lastCall(agent);
    expect(call.argv).toEqual(planned.agentArgv.slice(1));
    expect(call.stdin).toBe(renderPrompt(TEMPLATE, planned));
    expect(call.cwd).toBe(planned.clone);

    const clone = planned.clone;
    expect(git(clone, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('trial/todo-01');
    expect(git(clone, 'rev-parse', 'HEAD~1')).toBe(scaffold);
    expect(git(clone, 'config', 'remote.origin.partialclonefilter')).toBe('blob:none');
    expect(git(clone, 'for-each-ref', '--format=%(refname)').split('\n').sort()).toEqual([
      'refs/heads/main',
      'refs/heads/trial/todo-01',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/main',
    ]);
    expect(git(clone, 'rev-parse', 'origin/main')).toBe(scaffold);
    const message = git(clone, 'log', '-1', '--format=%B');
    expect(message.split('\n')[0]).toBe('feat(showcase): add todo-01 trial result');
    expect(message.split('\n').at(-1)).toBe(SIGN_OFF);
    expect(git(clone, 'status', '--porcelain')).toBe('');

    expect(evidence).toEqual(readEvidence());
    expect(validateEvidence(evidence)).toEqual(evidence);
    expect(evidence).toMatchObject({
      trial: {
        number: 1,
        id: 'todo-01',
        branch: 'trial/todo-01',
        workdir: 'todo-01-20261017T120000Z',
      },
      prompt: {
        path: 'tooling/trial/todo-prompt.md',
        templateSha256: sha256(TEMPLATE),
        sha256: sha256(renderPrompt(TEMPLATE, planned)),
      },
      scaffold: { rev: scaffold, enforcementRev: scaffold, lockfileSha256: sha256(LOCKFILE) },
      agent: {
        cli: agent,
        version: 'fake-agent 1.0.0',
        argv: planned.agentArgv,
        sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
        resolvedModel: 'claude-opus-fake',
        userConfigSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        fake: true,
      },
      run: { agentExitCode: 0, turns: 3, costUsd: 0.25 },
      result: {
        status: 'passed',
        commit: git(clone, 'rev-parse', 'HEAD'),
        changedPaths: ['showcase/todo-01/web/src/main.tsx'],
        outsideScope: [],
        outsideReads: [],
        patch: null,
      },
      checks: [{ name: 'verify', command: 'node -e process.exit(0)', exitCode: 0 }],
      failures: [],
    });
    expect(existsSync(join(planned.workdir, 'prompt.md'))).toBe(true);
    expect(readFileSync(planned.streamPath, 'utf8')).toContain('"subtype":"init"');
  });

  it('writes the evidence file as Biome formats it', async () => {
    await runTrial(plan({ agent: fakeAgent('formatted', WRITES_RESULT) }), quietDeps());
    const text = readFileSync(join(source, 'docs/trials/todo-01.json'), 'utf8');

    const formatted = spawnSync(BIOME, ['format', '--stdin-file-path=docs/trials/todo-01.json'], {
      cwd: REPOSITORY_ROOT,
      input: text,
      encoding: 'utf8',
    });
    expect(formatted.stdout).toBe(text);
  });

  it('records a failed check by name, exit code and output tail, and fails the run', async () => {
    const planned = {
      ...plan({ agent: fakeAgent('red-check', WRITES_RESULT) }),
      checks: [
        passingCheck,
        {
          name: 'e2e',
          argv: ['node', '-e', 'console.log("1 failed"); process.exit(3)'],
          timeoutMs: 30_000,
        },
      ],
    };

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result.status).toBe('failed');
    expect(evidence.checks[1]).toMatchObject({
      name: 'e2e',
      exitCode: 3,
      outputTail: '1 failed\n',
    });
    expect(evidence.failures).toEqual(['check e2e exited 3']);
    expect(existsSync(planned.patchPath)).toBe(true);
  });

  it('fails a run that writes outside its showcase folder and names the path', async () => {
    const agent = fakeAgent(
      'out-of-scope',
      `${WRITES_RESULT}\nput('apps/web/src/App.tsx', 'export const App = 2;\\n');`,
    );

    const evidence = await runTrial(plan({ agent }), quietDeps());

    expect(evidence.result.status).toBe('failed');
    expect(evidence.result.outsideScope).toEqual(['apps/web/src/App.tsx']);
    expect(evidence.failures).toContain('changed outside showcase/todo-01/: apps/web/src/App.tsx');
    expect(readFileSync(join(source, 'docs/trials/todo-01.patch'), 'utf8')).toContain(
      'export const App = 2;',
    );
  });

  it('allows lockfile changes inside its own importers only', async () => {
    const ownImporter = LOCKFILE.replace(
      'packages: {}',
      '  showcase/todo-01/web:\n    dependencies: {}\n\npackages: {}',
    );
    const inScope = await runTrial(
      plan({
        agent: fakeAgent(
          'own-importer',
          `${WRITES_RESULT}\nput('pnpm-lock.yaml', ${JSON.stringify(ownImporter)});`,
        ),
      }),
      quietDeps(),
    );
    clearEvidence();
    const outOfScope = await runTrial(
      plan({
        agent: fakeAgent(
          'new-package',
          `${WRITES_RESULT}\nput('pnpm-lock.yaml', ${JSON.stringify(ownImporter.replace('packages: {}', 'packages:\n  lodash@4.17.21: {}'))});`,
        ),
      }),
      quietDeps(),
    );

    expect(inScope.result).toMatchObject({ status: 'passed', outsideScope: [] });
    expect(inScope.result.changedPaths).toContain('pnpm-lock.yaml');
    expect(outOfScope.result).toMatchObject({ status: 'failed', outsideScope: ['pnpm-lock.yaml'] });
  });

  it('fails a run whose agent read outside the clone and records the path', async () => {
    const agent = fakeAgent(
      'outside-read',
      `${WRITES_RESULT}
emit({ type: 'assistant', message: { content: [
  { type: 'tool_use', name: 'Read', input: { file_path: process.cwd() + '/apps/web/src/App.tsx' } },
  { type: 'tool_use', name: 'Bash', input: { command: 'pnpm verify 2>/dev/null; ls ../other-trial /workspace/mono/pr5/showcase' } },
] } });`,
    );

    const evidence = await runTrial(plan({ agent }), quietDeps());

    expect(evidence.result.outsideReads).toEqual(['/workspace/mono/pr5/showcase']);
    expect(evidence.result.status).toBe('failed');
  });

  it('keeps a run whose agent fails, with its evidence and its patch', async () => {
    const planned = plan({ agent: fakeAgent('agent-fails', WRITES_RESULT, 1) });

    const evidence = await runTrial(planned, quietDeps());

    expect(validateEvidence(readEvidence())).toEqual(evidence);
    expect(evidence.run.agentExitCode).toBe(1);
    expect(evidence.result.status).toBe('failed');
    expect(evidence.failures).toContain('agent exited 1');
    expect(evidence.result.patch).toBe('docs/trials/todo-01.patch');
    expect(readFileSync(planned.patchPath, 'utf8')).toContain('showcase/todo-01/web/src/main.tsx');
  });

  it('fails a run whose agent leaves no result', async () => {
    const evidence = await runTrial(plan({ agent: fakeAgent('no-result', '') }), quietDeps());

    expect(evidence.result).toMatchObject({ status: 'failed', commit: null, changedPaths: [] });
    expect(evidence.failures).toContain('the agent left no change under showcase/todo-01/');
  });

  it('keeps the code in a patch when the commit hooks fail', async () => {
    const planned = plan({
      agent: fakeAgent('hook-fails', WRITES_RESULT),
      scaffoldRev: failingHookScaffold,
    });

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result).toMatchObject({
      status: 'failed',
      commit: null,
      patch: 'docs/trials/todo-01.patch',
    });
    expect(evidence.failures.join('\n')).toMatch(/commit hooks failed[\s\S]*hook says no/);
    expect(readFileSync(planned.patchPath, 'utf8')).toContain('showcase/todo-01/web/src/main.tsx');
  });

  it('records a setup failure from before the agent started and runs no agent', async () => {
    const agent = fakeAgent('never-runs', WRITES_RESULT);
    const planned = {
      ...plan({ agent }),
      setup: [{ name: 'install', argv: ['node', '-e', 'process.exit(7)'], timeoutMs: 30_000 }],
    };

    const evidence = await runTrial(planned, quietDeps());

    expect(existsSync(`${agent}.call.json`)).toBe(false);
    expect(evidence.run.agentExitCode).toBeNull();
    expect(evidence.result.status).toBe('failed');
    expect(evidence.failures).toEqual(['setup install exited 7']);
  });

  it('refuses to start when the evidence for the trial exists, and leaves it unchanged', async () => {
    write(source, 'docs/trials/todo-01.json', '{ "kept": true }\n');
    const planned = plan({ agent: fakeAgent('refused', WRITES_RESULT) });

    await expect(runTrial(planned, quietDeps())).rejects.toThrow('docs/trials/todo-01.json exists');
    expect(readFileSync(join(source, 'docs/trials/todo-01.json'), 'utf8')).toBe(
      '{ "kept": true }\n',
    );
    expect(existsSync(planned.workdir)).toBe(false);
  });

  it('retries a failure from before the agent started and keeps the earlier failure', async () => {
    const first = await runTrial(
      {
        ...plan({ agent: fakeAgent('first-attempt', WRITES_RESULT) }),
        setup: [{ name: 'install', argv: ['node', '-e', 'process.exit(7)'], timeoutMs: 30_000 }],
      },
      quietDeps(),
    );

    const retried = await runTrial(
      plan({ agent: fakeAgent('retry', WRITES_RESULT), retry: true }),
      quietDeps(),
    );

    expect(first.failures).toEqual(['setup install exited 7']);
    expect(retried.result.status).toBe('passed');
    expect(retried.failures).toEqual([]);
    expect(retried.retries).toEqual([
      { startedAt: first.run.startedAt, failures: ['setup install exited 7'] },
    ]);
  });

  it('refuses a retry once the agent has run', async () => {
    await runTrial(plan({ agent: fakeAgent('ran', WRITES_RESULT, 1) }), quietDeps());

    await expect(
      runTrial(plan({ agent: fakeAgent('no-retry', WRITES_RESULT), retry: true }), quietDeps()),
    ).rejects.toThrow('the agent already ran');
  });

  it.each([
    ['free disk is under 5 GB', { freeDiskBytes: () => 4e9 }, 'free disk'],
    ['a trial port is busy', { isPortBusy: async (port: number) => port === 5183 }, 'port 5183'],
  ])('refuses to start when %s', async (_case, overrides, reason) => {
    const planned = plan({ agent: fakeAgent('refused-env', WRITES_RESULT) });

    await expect(runTrial(planned, quietDeps(overrides))).rejects.toThrow(reason);
    expect(existsSync(planned.workdir)).toBe(false);
  });

  it('refuses to start while another trial workdir exists', async () => {
    const planned = plan({ agent: fakeAgent('second-workdir', WRITES_RESULT) });
    mkdirSync(join(planned.trialsRoot, 'todo-03-20261016T000000Z'));

    await expect(runTrial(planned, quietDeps())).rejects.toThrow('todo-03-20261016T000000Z');
    expect(readdirSync(planned.trialsRoot)).toEqual(['todo-03-20261016T000000Z']);
  });
});

describe('the run-trial CLI', () => {
  it('prints the plan for a dry run and starts nothing', () => {
    const trialsRoot = join(sandbox, 'dry-run-trials');
    mkdirSync(trialsRoot);

    const run = spawnSync(
      process.execPath,
      [
        CLI,
        '--trial',
        '2',
        '--scaffold',
        scaffold.slice(0, 12),
        '--trials-root',
        trialsRoot,
        '--dry-run',
      ],
      { cwd: source, env: gitEnv, encoding: 'utf8' },
    );

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const printed = JSON.parse(run.stdout);
    expect(printed).toMatchObject({
      trial: 2,
      id: 'todo-02',
      scaffoldRev: scaffold,
      branch: 'trial/todo-02',
      evidencePath: join(source, 'docs/trials/todo-02.json'),
      promptSha256: sha256(TEMPLATE.replace('{{ID}}', 'todo-02').replace('{{N}}', '2')),
      fake: false,
    });
    expect(printed.workdir.startsWith(`${trialsRoot}/todo-02-`)).toBe(true);
    expect(printed.agentArgv.slice(0, -1)).toEqual([
      'claude',
      '-p',
      '--model',
      'opus',
      '--permission-mode',
      'bypassPermissions',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
    ]);
    expect(printed.agentArgv.at(-1)).toMatch(/^[0-9a-f-]{36}$/);
    expect(readdirSync(trialsRoot)).toEqual([]);
  });

  it('fails on a scaffold rev the checkout does not have', () => {
    const run = spawnSync(
      process.execPath,
      [CLI, '--trial', '1', '--scaffold', 'f'.repeat(40), '--dry-run'],
      { cwd: source, env: gitEnv, encoding: 'utf8' },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--scaffold');
  });
});
