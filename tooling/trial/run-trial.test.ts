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
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { validateEvidence } from './evidence.mjs';
import { planTrial, renderPrompt, runTrial, systemDeps } from './run-trial.mjs';
import { loadTask, TODO_TASK } from './task.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
const CLI = join(REPOSITORY_ROOT, 'tooling/trial/run-trial.mjs');
const BIOME = join(REPOSITORY_ROOT, 'node_modules/.bin/biome');
const SCOPE = join(REPOSITORY_ROOT, 'tooling/trial/check-scope.mjs');
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

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const savedEnv = { ...process.env };

// A `runTrial` test spawns about 30 real processes (git, Biome, the fake
// agent), so its time grows with the box's load: the slowest, with two runs,
// took 16 s at a load average of 195 on 8 cores. Only the `runTrial` cases are
// asynchronous, and Jest can time out nothing else, so the budget is theirs.
jest.setTimeout(60_000);

let sandbox: string;
let source: string;
let caseDir: string;
let checkout: string;
let scaffold: string;
let failingHookScaffold: string;
let resultScaffold: string;

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
  const path = join(caseDir, `${name}.mjs`);
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

interface AgentCall {
  argv: string[];
  stdin: string;
  cwd: string;
}
const lastCall = (agent: string): AgentCall =>
  JSON.parse(readFileSync(`${agent}.call.json`, 'utf8'));

const WRITES_RESULT = "put('showcase/todo-01/web/src/main.tsx', 'export {};\\n');";

const hostDeps = (overrides: Partial<ReturnType<typeof systemDeps>> = {}) => ({
  ...systemDeps(),
  freeDiskBytes: () => 100e9,
  isPortBusy: async () => false,
  ...overrides,
});

/** `hostDeps` without bubblewrap, which CI lacks; translate mount paths back to private folders. */
const quietDeps = (overrides: Partial<ReturnType<typeof systemDeps>> = {}) => {
  const { exec } = systemDeps();
  return hostDeps({
    exec: (argv, options) =>
      exec(argv, {
        ...options,
        env:
          options.env === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(options.env).map(([name, value]) => [
                  name,
                  options.privateTmp && value === options.privateTmp.over
                    ? options.privateTmp.folder
                    : value,
                ]),
              ),
        privateTmp: undefined,
      }),
    ...overrides,
  });
};

/** A TCP port nothing listens on, so a test never takes a trial port another process needs. */
const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP address');
      const { port } = address;
      server.close(() => done(port));
    });
  });

const passingChecks = ['install', 'verify', 'e2e', 'structure'].map((name) => ({
  name,
  argv: ['true', name],
}));

function plan(options: {
  agent: string;
  trial?: number;
  scaffoldRev?: string;
  retry?: boolean;
  sharedTmp?: string;
  trialsRoot?: string;
}) {
  const trialsRoot =
    options.trialsRoot ?? join(sandbox, `trials-${Math.random().toString(16).slice(2)}`);
  mkdirSync(trialsRoot, { recursive: true });
  return {
    ...planTrial({
      trial: options.trial ?? 1,
      scaffoldRev: options.scaffoldRev ?? scaffold,
      root: checkout,
      trialsRoot,
      now: new Date('2026-10-17T12:00:00Z'),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      agentCommand: options.agent,
      claudeConfigDir: join(sandbox, 'claude-config'),
      corepackHome: join(homedir(), '.cache/node/corepack'),
      browsersPath: join(homedir(), '.cache/ms-playwright'),
      sharedTmp: options.sharedTmp ?? join(caseDir, 'shared-tmp'),
      retry: options.retry ?? false,
    }),
    setup: [
      {
        name: 'install',
        argv: ['git', 'config', 'core.hooksPath', '.githooks'],
      },
    ],
    checks: passingChecks,
  };
}

const readEvidence = (id = 'todo-01') =>
  JSON.parse(readFileSync(join(checkout, `docs/trials/${id}.json`), 'utf8'));

function clearEvidence() {
  rmSync(join(checkout, 'docs/trials'), { recursive: true, force: true });
}

beforeAll(() => {
  Object.assign(process.env, gitEnv);
  // Use the same physical root as the child processes and Git's checkout paths.
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'run-trial-')));
  source = join(sandbox, 'source');
  mkdirSync(source);
  write(sandbox, 'claude-config/settings.json', '{ "model": "opus" }\n');
  git(source, 'init', '-q', '-b', 'main');
  write(source, 'tooling/trial/todo-prompt.md', TEMPLATE);
  write(source, 'pnpm-lock.yaml', LOCKFILE);
  write(source, 'apps/web/src/App.tsx', 'export const App = 1;\n');
  write(source, '.gitignore', '*.local\n');
  write(source, '.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
  chmodSync(join(source, '.githooks/pre-commit'), 0o755);
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'scaffold');
  scaffold = git(source, 'rev-parse', 'HEAD');
  git(source, 'checkout', '-q', '-b', 'trial/todo-09');
  write(source, 'showcase/todo-09/web/package.json', '{}\n');
  git(source, 'add', '-A');
  git(source, 'commit', '-q', '-m', 'an earlier result');
  resultScaffold = git(source, 'rev-parse', 'HEAD');
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

  it('points every temp and cache variable into the workdir, keeping only the shared read-only caches outside it', () => {
    const planned = planTrial({
      trial: 2,
      scaffoldRev: 'c'.repeat(40),
      root: '/repo',
      trialsRoot: '/trials',
      now: new Date('2026-10-17T12:34:56.789Z'),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      claudeConfigDir: '/home/me/.claude',
      corepackHome: '/home/me/.cache/node/corepack',
      browsersPath: '/home/me/.cache/ms-playwright',
      pnpmStore: '/home/me/.local/share/pnpm/store/v10',
      retry: false,
    });
    const workdir = '/trials/todo-02-20261017T123456Z';

    expect(planned.privateEnv).toEqual({
      TMPDIR: `${workdir}/tmp`,
      TMP: `${workdir}/tmp`,
      TEMP: `${workdir}/tmp`,
      CLAUDE_CODE_TMPDIR: `${workdir}/tmp`,
      XDG_RUNTIME_DIR: `${workdir}/tmp`,
      XDG_CACHE_HOME: `${workdir}/cache`,
      npm_config_cache: `${workdir}/cache/npm`,
      COREPACK_HOME: '/home/me/.cache/node/corepack',
      PLAYWRIGHT_BROWSERS_PATH: '/home/me/.cache/ms-playwright',
    });
    expect(planned.checkPrivateEnv).toMatchObject({
      TMPDIR: `${workdir}/check-tmp`,
      XDG_CACHE_HOME: `${workdir}/check-cache`,
      COREPACK_HOME: '/home/me/.cache/node/corepack',
    });
    expect(planned.sharedCaches).toEqual([
      '/home/me/.cache/node/corepack',
      '/home/me/.cache/ms-playwright',
      '/home/me/.local/share/pnpm/store/v10',
    ]);
    expect(planned.sharedTmp).toBe('/tmp');
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
    ['--resume', '-r', '--continue', '-c'].forEach((flag) => {
      expect(planned.agentArgv).not.toContain(flag);
    });
  });

  it('runs the checks a passed run needs, including scope, on the committed result', () => {
    const planned = planTrial({
      trial: 1,
      scaffoldRev: 'c'.repeat(40),
      root: '/repo',
      trialsRoot: '/trials',
      now: new Date(),
      sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
      claudeConfigDir: '/home/me/.claude',
      retry: false,
    });

    expect(planned.checks.map(({ argv }) => argv.join(' '))).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm verify',
      'pnpm e2e',
      'node tooling/architecture/structure.mjs',
      'node tooling/trial/check-scope.mjs --id todo-01',
    ]);
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
        retry: false,
        ...override,
      }),
    ).toThrow(flag);
  });
});

describe('renderPrompt', () => {
  it.each(['todo', 'notes'])('points the %s prompt at the merged completion contract', (task) => {
    const template = readFileSync(join(REPOSITORY_ROOT, `tooling/trial/${task}-prompt.md`), 'utf8');
    expect(template).toContain(
      'Done means `pnpm verify` and `pnpm e2e` pass with every gate as it is, per `.agents/project/PR_QUALITY.md`.',
    );
  });

  it('fills the committed template with the trial id and number', () => {
    const template = readFileSync(join(REPOSITORY_ROOT, 'tooling/trial/todo-prompt.md'), 'utf8');
    const planned = { id: 'todo-02', trial: 2 };

    expect(renderPrompt(template, planned)).toBe(
      template.replaceAll('{{ID}}', 'todo-02').replaceAll('{{N}}', '2'),
    );
    expect(renderPrompt(template, planned)).toContain('`showcase/todo-02/`');
  });

  it('tells the agent what the structure validator and the diagram gate hold a result to', () => {
    const template = readFileSync(join(REPOSITORY_ROOT, 'tooling/trial/todo-prompt.md'), 'utf8');

    expect(template).toContain(
      'Each `package.json` equals its reference package except the name and the dependencies.',
    );
    expect(template).toContain('`showcase/{{ID}}/web/e2e/`');
    expect(template).toContain('`node tooling/architecture/structure.mjs`');
    expect(template).toContain('`pnpm arch:diagram`');
    expect(template).toContain('keep the written diagram');
  });

  it('tells the agent to read only inside its clone and how its page reaches the api', () => {
    const template = readFileSync(join(REPOSITORY_ROOT, 'tooling/trial/todo-prompt.md'), 'utf8');

    expect(template).toContain('Read only inside this clone.');
    expect(template).toContain('The page reaches the api through `/trpc`, as the reference does.');
  });

  it('throws on a placeholder it does not fill', () => {
    expect(() => renderPrompt('Trial {{ID}} on {{DATE}}', { id: 'todo-01', trial: 1 })).toThrow(
      '{{DATE}}',
    );
  });
});

function externalOutcome(outside: boolean, allowLock: boolean, failAcceptance: boolean) {
  const outsideScope = outside && !allowLock ? ['pnpm-lock.yaml'] : [];
  return {
    status: outsideScope.length || failAcceptance ? 'failed' : 'passed',
    outsideScope,
    acceptanceExit: failAcceptance ? 2 : 0,
  };
}

describe('runTrial', () => {
  // A run Jest gave up on keeps going, so each case gets its own evidence
  // checkout, agents and environment, where no later case looks.
  beforeEach(() => {
    process.env = { ...savedEnv, ...gitEnv };
    caseDir = mkdtempSync(join(sandbox, 'case-'));
    checkout = join(caseDir, 'checkout');
    git(sandbox, 'clone', '-q', '--shared', source, checkout);
  });

  it.each([
    false,
    true,
  ])('keeps Notes lockfile edits in scope only for its own importers (foreign: %s)', async (foreign) => {
    const lockfile = LOCKFILE.replace(
      'packages: {}',
      '  showcase/notes-01/web:\n    dependencies: {}\n\npackages: {}',
    ).replace('apps/web:', foreign ? 'apps/changed:' : 'apps/web:');
    const agent = fakeAgent(
      'notes-lockfile',
      `put('showcase/notes-01/web/src/main.tsx', 'export {};\\n');\nput('pnpm-lock.yaml', ${JSON.stringify(lockfile)});`,
    );
    const base = plan({ agent });
    const planned = {
      ...planTrial({
        ...base,
        now: new Date(),
        agentCommand: agent,
        task: { ...TODO_TASK, name: 'notes' },
        corepackHome: base.privateEnv.COREPACK_HOME,
        browsersPath: base.privateEnv.PLAYWRIGHT_BROWSERS_PATH,
      }),
      setup: base.setup,
      checks: base.checks,
    };
    const evidence = await runTrial(planned, quietDeps());
    expect(evidence.result).toMatchObject({
      status: foreign ? 'failed' : 'passed',
      outsideScope: foreign ? ['pnpm-lock.yaml'] : [],
    });
    if (!foreign)
      expect(git(planned.clone, 'show', 'HEAD:pnpm-lock.yaml')).toContain('showcase/notes-01/web:');
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [true, true, false],
    [false, false, true],
  ])('runs an external Codex task with lock change %s, allowed lock %s, failed acceptance %s', async (outside, allowLock, failAcceptance) => {
    const taskDir = join(caseDir, 'private-task');
    const expected = externalOutcome(outside, allowLock, failAcceptance);
    const lockPaths = allowLock ? ['pnpm-lock.yaml'] : [];
    const evidenceDir = join(caseDir, 'private-evidence');
    write(taskDir, 'prompt.md', 'Solve issue {{ID}}.\n');
    write(
      taskDir,
      'accept.mjs',
      "import { readFileSync } from 'node:fs'; if (readFileSync('src/result.txt', 'utf8') !== 'done') process.exit(1);\n",
    );
    const target = join(caseDir, 'target');
    mkdirSync(target);
    git(target, 'init', '-q', '-b', 'main');
    write(target, 'src/start.txt', 'start');
    git(target, 'add', '-A');
    git(target, 'commit', '-q', '-m', 'target');
    const rev = git(target, 'rev-parse', 'HEAD');
    write(
      taskDir,
      'task.json',
      JSON.stringify({
        name: 'issue-9001',
        prompt: 'prompt.md',
        target: { repo: target, rev },
        allowedPaths: ['src/', ...lockPaths],
        resultPaths: ['src/result.txt', ...lockPaths],
        setup: [],
        checks: [{ name: 'unit', argv: ['true'] }],
        acceptance: [{ name: 'private-acceptance', argv: ['node', '{{TASK_DIR}}/accept.mjs'] }],
        evidenceDir,
        land: 'patch',
      }),
    );
    const loaded = loadTask(join(taskDir, 'task.json'));
    const transcript = join(caseDir, 'codex-home/sessions/2026/10/rollout-test-thread.jsonl');
    const agent = fakeAgent(
      'codex',
      `
      put(${JSON.stringify(transcript)}, '');
      emit({ type: 'thread.started', thread_id: 'test-thread' });
      emit({ type: 'item.completed', item: { type: 'command_execution', command: ${JSON.stringify(`cat '${transcript}'`)}, aggregated_output: '', exit_code: 0 } });
      put('src/result.txt', 'done');
      put('src/ignored.txt', 'not committed');
      ${outside ? "put('pnpm-lock.yaml', 'not allowed');" : ''}
      emit({ type: 'item.completed', item: { type: 'command_execution', command: "/bin/bash -lc 'git status'", aggregated_output: '', exit_code: 0 } });
      emit({ type: 'turn.completed', usage: { input_tokens: 12, cached_input_tokens: 3, output_tokens: 8 } });
    `,
    );
    const planned = planTrial({
      ...plan({ agent }),
      ...loaded,
      corepackHome: join(homedir(), '.cache/node/corepack'),
      browsersPath: join(homedir(), '.cache/ms-playwright'),
      scaffoldRev: rev,
      agent: 'codex',
      agentCommand: agent,
      now: new Date(),
      codexHome: join(caseDir, 'codex-home'),
    });
    if (failAcceptance) writeFileSync(join(taskDir, 'accept.mjs'), 'process.exit(2);');
    const evidence = await runTrial(planned, quietDeps());
    expect(git(planned.clone, 'log', '-1', '--format=%B')).toContain(
      `Trial 1 of the issue-9001 trials at scaffold ${rev}.`,
    );
    expect(evidence.schema).toBe(2);
    expect(evidence.trial.id).toBe('issue-9001-codex-01');
    expect(evidence.agent).toMatchObject({
      name: 'codex',
      sessionId: 'test-thread',
      resolvedModel: 'gpt-6.1-sol',
      modelSource: 'pinned',
    });
    expect(evidence.run).toMatchObject({
      turns: 1,
      costUsd: null,
      tokenUsage: { input_tokens: 12, cached_input_tokens: 3, output_tokens: 8 },
    });
    expect(
      evidence.failures.filter(
        (failure) =>
          !failure.startsWith('changed outside') && !failure.startsWith('check private-acceptance'),
      ),
    ).toEqual([]);
    expect(evidence.result.status).toBe(expected.status);
    expect(evidence.result.outsideScope).toEqual(expected.outsideScope);
    expect(evidence.result.outsideReads).toEqual([]);
    expect(evidence.checks.map(({ name, exitCode }) => [name, exitCode])).toEqual([
      ['unit', 0],
      ['private-acceptance', expected.acceptanceExit],
    ]);
    expect(readFileSync(planned.patchPath, 'utf8')).toContain('src/result.txt');
    expect(existsSync(join(planned.checkClone, 'src/ignored.txt'))).toBe(false);
    expect(readFileSync(planned.patchPath, 'utf8')).toContain('src/ignored.txt');
    expect(existsSync(join(checkout, 'docs/trials'))).toBe(false);
    expect(git(planned.clone, 'rev-parse', 'HEAD~1')).toBe(rev);
    expect(existsSync(join(planned.origin, 'FETCH_HEAD'))).toBe(false);
    expect(lastCall(agent).argv).toEqual(planned.agentArgv.slice(1));
    expect(lastCall(agent).stdin).toBe('Solve issue issue-9001-codex-01.\n');
    expect(validateEvidence(evidence)).toEqual(evidence);
  });

  it('runs a custom task in the invoking checkout without a pnpm lockfile', async () => {
    const repository = join(caseDir, 'current-target');
    mkdirSync(repository);
    git(repository, 'init', '-q', '-b', 'main');
    write(repository, 'src/start.txt', 'start');
    git(repository, 'add', '-A');
    git(repository, 'commit', '-q', '-m', 'target');
    const rev = git(repository, 'rev-parse', 'HEAD');
    const taskDir = join(caseDir, 'current-task');
    write(taskDir, 'prompt.md', 'Solve {{ID}}');
    write(
      taskDir,
      'task.json',
      JSON.stringify({
        name: 'current',
        prompt: 'prompt.md',
        allowedPaths: ['src/'],
        setup: [],
        checks: [{ name: 'unit', argv: ['true'] }],
        land: 'patch',
        evidenceDir: join(caseDir, 'current-evidence'),
      }),
    );
    const agent = fakeAgent('current', "put('src/result.txt', 'done');");
    const base = plan({ agent });
    const planned = planTrial({
      ...base,
      ...loadTask(join(taskDir, 'task.json')),
      root: repository,
      scaffoldRev: rev,
      agentCommand: agent,
      now: new Date(),
      corepackHome: base.privateEnv.COREPACK_HOME,
      browsersPath: base.privateEnv.PLAYWRIGHT_BROWSERS_PATH,
    });
    const evidence = await runTrial(planned, quietDeps());
    expect(evidence.failures).toEqual([]);
    expect(evidence.result.status).toBe('passed');
    expect(evidence.trial.id).toBe('current-01');
    expect(evidence.task?.target).toBeNull();
    expect(readFileSync(planned.patchPath, 'utf8')).toContain('src/result.txt');
  });

  it('uses the Codex id rule for Todo and retains the Claude id rule', () => {
    const base = plan({ agent: '/fake' });
    const codex = planTrial({
      ...base,
      task: TODO_TASK,
      agent: 'codex',
      now: new Date(),
      corepackHome: join(homedir(), '.cache/node/corepack'),
      browsersPath: join(homedir(), '.cache/ms-playwright'),
    });
    expect(codex.id).toBe('todo-codex-01');
    expect(base.id).toBe('todo-01');
    expect(codex.agentArgv).toEqual([
      'codex',
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--dangerously-bypass-hook-trust',
      '-m',
      'gpt-6.1-sol',
      '-c',
      'allow_login_shell=false',
      '-c',
      `projects.${JSON.stringify(codex.clone)}.trust_level="trusted"`,
      '-C',
      codex.clone,
      '-',
    ]);
  });

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
    expect(existsSync(join(planned.origin, 'FETCH_HEAD'))).toBe(false);
    const message = git(clone, 'log', '-1', '--format=%B');
    expect(message).toContain(`Trial 1 of the Todo trials at scaffold ${scaffold}.\n\n${SIGN_OFF}`);
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
        stoppedServers: [],
        patch: null,
      },
      harness: { sha256: expect.stringMatching(/^[0-9a-f]{64}$/), matchesScaffold: false },
      checks: ['install', 'verify', 'e2e', 'structure'].map((name) => ({
        name,
        command: `true ${name}`,
        exitCode: 0,
      })),
      failures: [],
    });
    expect(existsSync(join(planned.workdir, 'prompt.md'))).toBe(true);
    expect(readFileSync(planned.streamPath, 'utf8')).toContain('"subtype":"init"');
    const keptStream = readFileSync(join(checkout, 'docs/trials/todo-01.stream.jsonl'), 'utf8');
    expect(keptStream).toContain('"subtype":"init"');
    expect(evidence.stream).toEqual({
      path: 'docs/trials/todo-01.stream.jsonl',
      sha256: sha256(keptStream),
      userTextEvents: 0,
    });
  });

  it('keeps the agent stream beside the evidence, secrets redacted, and counts its user text events', async () => {
    const token = 'oauth-secret-value-1234';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
    try {
      const evidence = await runTrial(
        plan({
          agent: fakeAgent(
            'stream-kept',
            `${WRITES_RESULT}
emit({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'a second prompt' }] } });
emit({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } });
emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'token ' + process.env.CLAUDE_CODE_OAUTH_TOKEN }] } });`,
            1,
          ),
        }),
        quietDeps(),
      );
      const kept = readFileSync(join(checkout, 'docs/trials/todo-01.stream.jsonl'), 'utf8');

      expect(kept).not.toContain(token);
      expect(kept).toContain('token [redacted CLAUDE_CODE_OAUTH_TOKEN]');
      expect(kept).toContain('a second prompt');
      expect(evidence.stream).toEqual({
        path: 'docs/trials/todo-01.stream.jsonl',
        sha256: sha256(kept),
        userTextEvents: 1,
      });
    } finally {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it('writes the evidence file as Biome formats it', async () => {
    await runTrial(plan({ agent: fakeAgent('formatted', WRITES_RESULT) }), quietDeps());
    const text = readFileSync(join(checkout, 'docs/trials/todo-01.json'), 'utf8');

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
        ...passingChecks.slice(0, 2),
        {
          name: 'e2e',
          argv: ['node', '-e', 'console.log("1 failed"); process.exit(3)'],
        },
        ...passingChecks.slice(3),
      ],
    };

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result.status).toBe('failed');
    expect(evidence.checks[2]).toMatchObject({
      name: 'e2e',
      exitCode: 3,
      outputTail: '1 failed\n',
    });
    expect(evidence.failures).toEqual(['check e2e exited 3']);
    expect(existsSync(planned.patchPath)).toBe(true);
  });

  it.each([0, 7])('preserves scope exit %i and rejects outside writes', async (exitCode) => {
    const agent = fakeAgent(
      'out-of-scope',
      `${WRITES_RESULT}\nput('apps/web/src/App.tsx', 'export const App = 2;\\n');`,
    );

    const command = ['sh', '-c', `echo scope; exit ${exitCode}`];
    const evidence = await runTrial(
      {
        ...plan({ agent }),
        checks: [...passingChecks, { name: 'scope', argv: command }],
      },
      quietDeps(),
    );

    expect(evidence.checks.find(({ name }) => name === 'scope')).toMatchObject({
      exitCode,
      outputTail: 'scope\n',
    });
    expect(evidence.result.status).toBe('failed');
    expect(evidence.result.outsideScope).toEqual(['apps/web/src/App.tsx']);
    expect(evidence.failures).toContain('changed outside showcase/todo-01/: apps/web/src/App.tsx');
    expect(readFileSync(join(checkout, 'docs/trials/todo-01.patch'), 'utf8')).toContain(
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

  it.each(['todo-01', 'notes-01'])('checks %s scope during a session and after commit', (id) => {
    git(checkout, 'update-ref', 'refs/remotes/origin/main', scaffold);
    const check = () =>
      spawnSync('node', [SCOPE, '--id', id], { cwd: checkout, env: gitEnv, encoding: 'utf8' });
    const ownImporter = LOCKFILE.replace(
      'packages: {}',
      `  showcase/${id}/web:\n    dependencies: {}\n\npackages: {}`,
    );
    write(checkout, 'pnpm-lock.yaml', ownImporter);
    write(checkout, `showcase/${id}/web/result.txt`, 'result');
    expect(check().status).toBe(0);
    write(
      checkout,
      'pnpm-lock.yaml',
      ownImporter.replace('packages: {}', 'packages:\n  foreign@1: {}'),
    );
    const failed = check();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('Restore changes outside showcase/');
    expect(failed.stderr).toContain('pnpm-lock.yaml');
    write(checkout, 'pnpm-lock.yaml', ownImporter);
    write(checkout, 'outside.txt', 'outside');
    expect(check().stderr).toContain('outside.txt');
    git(checkout, 'add', '-A');
    git(
      checkout,
      '-c',
      'user.name=Ben Sheridan-Edwards',
      '-c',
      'user.email=bensheridanedwards@gmail.com',
      'commit',
      '-qm',
      'scope fixture',
    );
    expect(check().stderr).toContain('outside.txt');
  });

  it('fails a run whose agent named a path outside its workdir, and only then', async () => {
    const transcript = join(sandbox, 'claude-config/projects/earlier/session.jsonl');
    write(sandbox, 'claude-config/projects/earlier/session.jsonl', '{}\n');
    write(sandbox, 'PLAN.md', '# plan\n');
    write(sandbox, 'NOTES.md', '# notes\n');
    write(sandbox, 'tmp/earlier-scratch/result.txt', 'an earlier result\n');
    const planned = plan({ agent: join(caseDir, 'outside-read.mjs') });
    const slug = planned.clone.replace(/[^a-zA-Z0-9]/g, '-');
    const claudeTmp = join(sandbox, 'tmp', `claude-${process.getuid?.()}`);
    const otherTasks = join(claudeTmp, '-workspace-mono-pr5/1111/tasks/b1.output');
    const otherSession = join(sandbox, 'claude-config/projects', slug, '2222/tool-results/x.txt');
    const sharedScratch = join(claudeTmp, slug, planned.sessionId, 'tasks/b1.output');
    const otherCache = join(homedir(), '.cache/some-tool/data.json');
    const otherWorkdir = join(planned.trialsRoot, 'todo-02-20261001T000000Z/repo/README.md');
    fakeAgent(
      'outside-read',
      `${WRITES_RESULT}
put(${JSON.stringify(otherTasks)}, 'an earlier result\\n');
const tool = (name, input) => ({ type: 'tool_use', name, input });
emit({ type: 'assistant', message: { content: [
  tool('Read', { file_path: process.cwd() + '/apps/web/src/App.tsx' }),
  tool('Read', { file_path: '../prompt.md' }),
  tool('Read', { file_path: ${JSON.stringify(join(checkout, 'apps/web/src/App.tsx'))} }),
  tool('Read', { file_path: ${JSON.stringify(transcript)} }),
  tool('Read', { file_path: ${JSON.stringify(join(sandbox, 'PLAN.md'))} }),
  tool('Read', { file_path: ${JSON.stringify(join(sandbox, 'claude-config/settings.json'))} }),
  tool('Grep', { pattern: 'todo', path: ${JSON.stringify(sandbox)} }),
  tool('Read', { file_path: ${JSON.stringify(otherTasks)} }),
  tool('Read', { file_path: ${JSON.stringify(otherSession)} }),
  tool('Read', { file_path: ${JSON.stringify(otherWorkdir)} }),
  tool('Read', { file_path: ${JSON.stringify(sharedScratch)} }),
  tool('Read', { file_path: '~/.cache/some-tool/data.json' }),
  tool('Read', { file_path: '~/.ssh/config' }),
  tool('Bash', { command: 'cat ${join(sandbox, 'tmp/earlier-scratch/result.txt')}' }),
  tool('Bash', { command: '(cd showcase/todo-01/web && ls) && cat ../../../NOTES.md' }),
  tool('Bash', { command: 'grep -rn "/trpc" showcase 2>/dev/null; ls /usr/bin ${REPOSITORY_ROOT}' }),
  tool('Bash', { command: "cat <<'EOF'\\n<div>hi</div> // note\\nimport { x } from '../../domain.ts';\\nEOF" }),
  tool('Bash', { command: 'ls ${checkout} ${checkout}/no-such-folder' }),
  tool('Bash', { command: 'cd ../.. && ls; cat ../prompt.md' }),
] } });`,
    );

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result.outsideReads).toEqual(
      [
        REPOSITORY_ROOT,
        sandbox,
        join(sandbox, 'PLAN.md'),
        join(sandbox, 'NOTES.md'),
        join(sandbox, 'tmp/earlier-scratch/result.txt'),
        checkout,
        join(checkout, 'apps/web/src/App.tsx'),
        transcript,
        otherTasks,
        otherSession,
        otherWorkdir,
        sharedScratch,
        otherCache,
        join(homedir(), '.ssh/config'),
        planned.trialsRoot,
      ].sort(),
    );
    expect(evidence.result.status).toBe('failed');
  });

  it('passes a clean run whose agent reads its own session files, its scratch and caches, and cds about its clone', async () => {
    const planned = plan({ agent: join(caseDir, 'clean-agent.mjs') });
    const tmp = planned.privateEnv.TMPDIR;
    const slug = planned.clone.replace(/[^a-zA-Z0-9]/g, '-');
    const tasks = join(tmp, `claude-${process.getuid?.()}`, slug, planned.sessionId, 'tasks');
    const toolResults = join(
      sandbox,
      'claude-config/projects',
      slug,
      planned.sessionId,
      'tool-results/verify.txt',
    );
    const scratch = join(tmp, 'agent-scratch/notes.txt');
    const sharedTmpLog = join(planned.sharedTmp, 'verify.log');
    fakeAgent(
      'clean-agent',
      `${WRITES_RESULT}
put(${JSON.stringify(join(tasks, 'b1.output'))}, 'verify ok\\n');
put(${JSON.stringify(scratch)}, 'notes\\n');
put(${JSON.stringify(sharedTmpLog)}, 'verify ok\\n');
const tool = (name, input) => ({ type: 'tool_use', name, input });
const bash = (command) => tool('Bash', { command });
emit({ type: 'assistant', message: { content: [
  bash('pnpm verify > /dev/null 2>&1'),
  tool('Read', { file_path: ${JSON.stringify(join(tasks, 'b1.output'))} }),
  tool('Read', { file_path: ${JSON.stringify(toolResults)} }),
  tool('Read', { file_path: ${JSON.stringify(scratch)} }),
  bash('cat ${scratch}'),
  tool('Read', { file_path: ${JSON.stringify(sharedTmpLog)} }),
  bash('tail ${sharedTmpLog}'),
  tool('Read', { file_path: '~/.cache/ms-playwright/chromium/INSTALLATION_COMPLETE' }),
  tool('Glob', { pattern: '*', path: ${JSON.stringify(join(homedir(), '.cache/node/corepack'))} }),
  bash('cd showcase/todo-01/web && ls ../..'),
  bash('ls ../../../apps'),
  bash('(cd src && ls ..) && ls ../../..'),
  bash('cd ../../.. && git status'),
  bash('cd .. && ls'),
  bash('cd ~/.cache/ms-playwright && ls'),
  bash('ls ..'),
] } });`,
    );

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result.outsideReads).toEqual([]);
    expect(evidence.result.status).toBe('passed');
  });

  it('gives every command a private temp folder, so a decoy in the parent one stays unseen and reading it fails the run', async () => {
    const parentTmp = join(caseDir, 'parent-tmp');
    mkdirSync(parentTmp, { recursive: true });
    const decoy = join(parentTmp, 'verify.log');
    writeFileSync(decoy, "another job's log\n");
    const views = join(caseDir, 'temp-views');
    mkdirSync(views, { recursive: true });
    const look = (who: string) =>
      `const os = require('node:os'), fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(join(views, `${who}.json`))}, JSON.stringify({ tmpdir: os.tmpdir(), entries: fs.readdirSync(os.tmpdir()), env: process.env }));`;
    const base = plan({
      agent: fakeAgent(
        'decoy',
        `${WRITES_RESULT}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
${look('agent')}
const tool = (name, input) => ({ type: 'tool_use', name, input });
emit({ type: 'assistant', message: { content: [
  tool('Read', { file_path: ${JSON.stringify(decoy)} }),
  tool('Bash', { command: 'cat ${decoy}' }),
] } });`,
      ),
    });
    const planned = {
      ...base,
      setup: [...base.setup, { name: 'look', argv: ['node', '-e', look('setup')] }],
      checks: [
        ...passingChecks.filter(({ name }) => name !== 'verify'),
        { name: 'verify', argv: ['node', '-e', look('check')] },
      ],
    };

    const callerTmp = process.env.TMPDIR;
    process.env.TMPDIR = parentTmp;
    try {
      const evidence = await runTrial(planned, quietDeps());

      ['setup', 'agent', 'check'].forEach((who) => {
        const view = JSON.parse(readFileSync(join(views, `${who}.json`), 'utf8'));
        expect(view.tmpdir.startsWith(`${planned.workdir}/`)).toBe(true);
        expect(view.entries).not.toContain(basename(decoy));
        ['TMPDIR', 'TMP', 'TEMP', 'CLAUDE_CODE_TMPDIR', 'XDG_RUNTIME_DIR'].forEach((name) => {
          expect(view.env[name]).toBe(view.tmpdir);
        });
        expect(view.env.XDG_CACHE_HOME.startsWith(`${planned.workdir}/`)).toBe(true);
        expect(view.env.npm_config_cache.startsWith(`${planned.workdir}/`)).toBe(true);
      });
      const tmpOf = (who: string) =>
        JSON.parse(readFileSync(join(views, `${who}.json`), 'utf8')).tmpdir;
      expect(tmpOf('check')).not.toBe(tmpOf('agent'));
      expect(evidence.result.outsideReads).toEqual([decoy]);
      expect(evidence.result.status).toBe('failed');
      expect(readdirSync(parentTmp)).toEqual(['verify.log']);
      expect(readFileSync(decoy, 'utf8')).toBe("another job's log\n");
    } finally {
      process.env.TMPDIR = callerTmp;
    }
  });

  it('runs the setup, the agent, the commit hooks and the checks each with its own folder over the shared /tmp', async () => {
    const agent = fakeAgent('confined', WRITES_RESULT);
    const planned = plan({
      agent,
      sharedTmp: '/tmp',
      trialsRoot: join(caseDir, 'a-long-trials-root'.repeat(8)),
    });
    const calls: { argv: readonly string[]; privateTmp: unknown }[] = [];
    const deps = quietDeps();

    const evidence = await runTrial(planned, {
      ...deps,
      exec: (argv, options) => {
        if (options.privateTmp) {
          ['TMPDIR', 'TMP', 'TEMP', 'CLAUDE_CODE_TMPDIR', 'XDG_RUNTIME_DIR'].forEach((name) => {
            expect(options.env?.[name]).toBe('/tmp');
            expect(
              Buffer.byteLength(join(options.env?.[name] ?? '', 's'.repeat(64))),
            ).toBeLessThanOrEqual(107);
          });
        }
        calls.push({ argv, privateTmp: options.privateTmp });
        return deps.exec(argv, options);
      },
    });

    const over = (folder: string) => ({
      folder,
      over: planned.sharedTmp,
      keep: [planned.workdir, agent],
    });
    expect(
      calls
        .filter(({ privateTmp }) => privateTmp)
        .map(({ argv, privateTmp }) => [
          (argv[0] === 'git' && argv.includes('commit')
            ? ['git', 'commit']
            : argv.slice(0, 2)
          ).join(' '),
          privateTmp,
        ]),
    ).toEqual([
      ['true', over(planned.privateEnv.TMPDIR)],
      ['git config', over(planned.privateEnv.TMPDIR)],
      [`${agent} --version`, over(planned.privateEnv.TMPDIR)],
      [`${agent} -p`, over(planned.privateEnv.TMPDIR)],
      ['git commit', over(planned.privateEnv.TMPDIR)],
      ...passingChecks.map(({ argv }) => [argv.join(' '), over(planned.checkPrivateEnv.TMPDIR)]),
    ]);
    expect(evidence.result.status).toBe('passed');
  });

  it('fails before the agent starts, naming bubblewrap, when it cannot give the trial a private /tmp', async () => {
    write(
      caseDir,
      'no-userns-bin/bwrap',
      '#!/bin/sh\necho "bwrap: setting up uid map: Permission denied" >&2\nexit 1\n',
    );
    chmodSync(join(caseDir, 'no-userns-bin/bwrap'), 0o755);
    const agent = fakeAgent('never-confined', WRITES_RESULT);
    const callerPath = process.env.PATH;
    process.env.PATH = `${join(caseDir, 'no-userns-bin')}:${callerPath}`;
    try {
      const evidence = await runTrial(plan({ agent }), hostDeps());

      expect(evidence.failures).toEqual([
        expect.stringMatching(/^bubblewrap could not give the trial a private \/tmp \(exit 1\)/),
      ]);
      expect(evidence.failures[0]).toContain('setting up uid map: Permission denied');
      expect(evidence.run.agentExitCode).toBeNull();
      expect(existsSync(`${agent}.call.json`)).toBe(false);
    } finally {
      process.env.PATH = callerPath;
    }
  });

  it('gives the setup, the agent and the checks their own /tmp on this host, or fails before the agent naming bubblewrap', async () => {
    const hostConfines = spawnSync('bwrap', ['--dev-bind', '/', '/', 'true']).status === 0;
    const decoyFolder = mkdtempSync('/tmp/run-trial-decoy-');
    writeFileSync(join(decoyFolder, 'verify.log'), "another job's log\n");
    const log = `verify-${Math.random().toString(16).slice(2)}.log`;
    const look = (who: string) =>
      `test "$TMPDIR" = /tmp && test "$XDG_RUNTIME_DIR" = /tmp && ls -A /tmp > ../${who}.tmp-view`;
    const agent = fakeAgent(
      'host-confined',
      `${WRITES_RESULT}
execSync(${JSON.stringify(`echo ok > /tmp/${log} && ${look('agent')}`)});
const tool = (name, input) => ({ type: 'tool_use', name, input });
emit({ type: 'assistant', message: { content: [
  tool('Bash', { command: ${JSON.stringify(`pnpm verify > /tmp/${log} 2>&1`)} }),
  tool('Read', { file_path: ${JSON.stringify(`/tmp/${log}`)} }),
  tool('Bash', { command: ${JSON.stringify(`tail -5 /tmp/${log}`)} }),
] } });`,
    );
    const base = plan({ agent, sharedTmp: '/tmp' });
    const planned = {
      ...base,
      setup: [...base.setup, { name: 'look', argv: ['sh', '-c', look('setup')] }],
      checks: [
        ...passingChecks.filter(({ name }) => name !== 'verify'),
        { name: 'verify', argv: ['sh', '-c', look('check')] },
      ],
    };
    const view = (who: string) =>
      readFileSync(join(planned.workdir, `${who}.tmp-view`), 'utf8').split('\n');

    try {
      const evidence = await runTrial(planned, hostDeps());

      if (hostConfines) {
        expect(evidence.failures).toEqual([]);
        expect(evidence.result.outsideReads).toEqual([]);
        ['setup', 'agent', 'check'].forEach((who) => {
          expect(view(who)).not.toContain(basename(decoyFolder));
        });
        expect(view('agent')).toContain(log);
        expect(view('check')).not.toContain(log);
        expect(existsSync(join('/tmp', log))).toBe(false);
        expect(readFileSync(join(planned.privateEnv.TMPDIR, log), 'utf8')).toBe('ok\n');
      } else {
        expect(evidence.failures).toEqual([
          expect.stringMatching(/^bubblewrap could not give the trial a private \/tmp/),
        ]);
        expect(evidence.run.agentExitCode).toBeNull();
      }
    } finally {
      rmSync(decoyFolder, { recursive: true, force: true });
    }
  });

  it("fails a run whose agent wrote into the checks' private folders, and runs no check", async () => {
    const agent = fakeAgent(
      'poisons-checks',
      `${WRITES_RESULT}\nput(process.cwd() + '/../check-cache/jest/haste-map', 'stale');`,
    );

    const evidence = await runTrial(plan({ agent }), quietDeps());

    expect(evidence.failures).toEqual([
      "the agent wrote into check-cache, the checks' private folder",
    ]);
    expect(evidence.checks).toEqual([]);
    expect(evidence.result.status).toBe('failed');
  });

  it('puts no time limit on the agent or the checks, and records how long each took', async () => {
    const hold = (name: string) => ({
      started: join(caseDir, `${name}.started`),
      release: join(caseDir, `${name}.release`),
    });
    const holdUntilReleased = ({ started, release }: { started: string; release: string }) =>
      `require('node:fs').writeFileSync(${JSON.stringify(started)}, ''); while (!require('node:fs').existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);`;
    const agentHold = hold('slow-agent');
    const checkHold = hold('slow-check');
    const base = plan({
      agent: fakeAgent(
        'slow-agent',
        `${WRITES_RESULT}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
${holdUntilReleased(agentHold)}`,
      ),
    });
    const planned = {
      ...base,
      checks: [
        ...passingChecks.filter(({ name }) => name !== 'verify'),
        { name: 'verify', argv: ['node', '-e', holdUntilReleased(checkHold)] },
      ],
    };
    const hundredHours = 100 * 60 * 60 * 1000;
    let settled = false;
    const outlast = async ({ started, release }: { started: string; release: string }) => {
      if (!existsSync(started)) {
        if (settled) {
          throw new Error(`the run ended before ${started} appeared`);
        }
        await new Promise((done) => setImmediate(done));
        return outlast({ started, release });
      }
      jest.advanceTimersByTime(hundredHours);
      writeFileSync(release, '');
    };

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const running = runTrial(planned, quietDeps());
      running.finally(() => {
        settled = true;
      });
      await outlast(agentHold);
      await outlast(checkHold);
      const evidence = await running;

      expect(evidence.failures).toEqual([]);
      expect(evidence.run.agentExitCode).toBe(0);
      expect(evidence.run.agentDurationMs).toBeGreaterThanOrEqual(hundredHours);
      expect(
        evidence.checks.find(({ name }) => name === 'verify')?.durationMs,
      ).toBeGreaterThanOrEqual(hundredHours);
      expect(evidence.run.durationMs).toBeGreaterThanOrEqual(2 * hundredHours);
      expect(validateEvidence(readEvidence())).toEqual(evidence);
    } finally {
      jest.useRealTimers();
    }
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
      setup: [{ name: 'install', argv: ['node', '-e', 'process.exit(7)'] }],
    };

    const evidence = await runTrial(planned, quietDeps());

    expect(existsSync(`${agent}.call.json`)).toBe(false);
    expect(evidence.run.agentExitCode).toBeNull();
    expect(evidence.result.status).toBe('failed');
    expect(evidence.failures).toEqual(['setup install exited 7']);
  });

  it('fails a run that moves a file out of apps/ into its folder', async () => {
    const agent = fakeAgent(
      'moves',
      `${WRITES_RESULT}\nexecSync('git mv apps/web/src/App.tsx showcase/todo-01/web/src/App.tsx');`,
    );

    const evidence = await runTrial(plan({ agent }), quietDeps());

    expect(evidence.result.outsideScope).toEqual(['apps/web/src/App.tsx']);
    expect(evidence.result.changedPaths).toContain('showcase/todo-01/web/src/App.tsx');
    expect(evidence.result.status).toBe('failed');
  });

  it('makes the one result commit with the hooks on, whatever the agent committed', async () => {
    const agent = fakeAgent(
      'commits',
      `${WRITES_RESULT}\nexecSync('git switch -q main && git add -A && git -c user.name=Agent -c user.email=agent@example.com commit -q --no-verify -m wip');`,
    );
    const planned = plan({ agent });

    const evidence = await runTrial(planned, quietDeps());

    const clone = planned.clone;
    expect(evidence.result.status).toBe('passed');
    expect(git(clone, 'symbolic-ref', '--short', 'HEAD')).toBe('trial/todo-01');
    expect(git(clone, 'rev-list', '--count', `${scaffold}..HEAD`)).toBe('1');
    expect(git(clone, 'log', '-1', '--format=%s')).toBe('feat(showcase): add todo-01 trial result');
    expect(git(clone, 'rev-parse', 'main')).toBe(scaffold);
  });

  it('starts the agent as a fresh session with its credentials, and nothing that points back', async () => {
    const seen = join(caseDir, 'agent-env.json');
    const parent = {
      CLAUDECODE: '1',
      CLAUDE_CODE_SESSION_ID: 'parent-session',
      CLAUDE_CODE_OAUTH_TOKEN: 'token',
      ANTHROPIC_API_KEY: 'key',
      ANTHROPIC_MODEL: 'claude-haiku',
      MAX_THINKING_TOKENS: '1024',
      DISABLE_AUTOUPDATER: '1',
      LC_ALL: 'C.UTF-8',
      npm_lifecycle_event: 'trial',
      INIT_CWD: checkout,
    };
    Object.assign(process.env, parent);
    try {
      await runTrial(
        plan({
          agent: fakeAgent(
            'env',
            `${WRITES_RESULT}\nwriteFileSync(${JSON.stringify(seen)}, JSON.stringify(process.env));`,
          ),
        }),
        quietDeps(),
      );
    } finally {
      Object.keys(parent).forEach((name) => {
        delete process.env[name];
      });
    }
    const env = JSON.parse(readFileSync(seen, 'utf8'));

    expect(env).toMatchObject({
      CLAUDE_CODE_OAUTH_TOKEN: 'token',
      ANTHROPIC_API_KEY: 'key',
      LC_ALL: 'C.UTF-8',
      HOME: process.env.HOME,
    });
    expect(env.PATH).toContain('/');
    [
      'CLAUDECODE',
      'CLAUDE_CODE_SESSION_ID',
      'ANTHROPIC_MODEL',
      'MAX_THINKING_TOKENS',
      'DISABLE_AUTOUPDATER',
      'GIT_AUTHOR_NAME',
      'npm_lifecycle_event',
      'INIT_CWD',
    ].forEach((name) => {
      expect(env[name]).toBeUndefined();
    });
  });

  it.each([
    'remote-settings.json',
    'rules/style.md',
  ])('hashes the config entry %s into the user config hash', async (entry) => {
    const userConfigHash = async (text: string) => {
      write(sandbox, `claude-config/${entry}`, text);
      clearEvidence();
      const evidence = await runTrial(
        plan({ agent: fakeAgent('config-hash', WRITES_RESULT) }),
        quietDeps(),
      );
      return evidence.agent.userConfigSha256;
    };

    expect(await userConfigHash('one\n')).not.toBe(await userConfigHash('two\n'));
  });

  it.each([
    'package.json',
    'tooling/lighthouse/lighthouserc.json',
    'tooling/jest/jest.setup.ts',
    '.npmrc',
  ])('moves the enforcement revision on a scaffold commit to %s', async (path) => {
    write(checkout, path, `${JSON.stringify({ changed: path })}\n`);
    git(checkout, 'add', path);
    git(checkout, 'commit', '-q', '-m', `change ${path}`);
    const changed = git(checkout, 'rev-parse', 'HEAD');

    const evidence = await runTrial(
      plan({ agent: fakeAgent('enforcement', WRITES_RESULT), scaffoldRev: changed }),
      quietDeps(),
    );

    expect(evidence.scaffold.enforcementRev).toBe(changed);
  });

  it('runs the checks as CI does, on a clean clone of the result commit', async () => {
    const seen = join(caseDir, 'check-saw.json');
    const planned = {
      ...plan({
        agent: fakeAgent('leaves-residue', `${WRITES_RESULT}\nput('secret.local', 'x');`),
      }),
      checks: [
        ...passingChecks.filter(({ name }) => name !== 'verify'),
        {
          name: 'verify',
          argv: [
            'node',
            '-e',
            `require('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ cwd: process.cwd(), ci: process.env.CI, residue: require('fs').existsSync('secret.local'), result: require('fs').existsSync('showcase/todo-01/web/src/main.tsx') }))`,
          ],
        },
      ],
    };

    await runTrial(planned, quietDeps());

    expect(JSON.parse(readFileSync(seen, 'utf8'))).toEqual({
      cwd: planned.checkClone,
      ci: '1',
      residue: false,
      result: true,
    });
  });

  it('stops a server the agent left on a trial port before the checks, and the run still passes', async () => {
    const port = await freePort();
    const pidFile = join(caseDir, 'stray-server.pid');
    const portIsFree = `const s = require('net').createServer(); s.once('error', () => process.exit(1)); s.listen(${port}, '127.0.0.1', () => s.close(() => process.exit(0)));`;
    const agent = fakeAgent(
      'stray-server',
      `${WRITES_RESULT}
const { spawn } = await import('node:child_process');
const { connect } = await import('node:net');
const server = spawn(process.execPath, ['-e', "require('net').createServer().listen(${port}, '127.0.0.1')"], { detached: true, stdio: 'ignore' });
server.unref();
writeFileSync(${JSON.stringify(pidFile)}, String(server.pid));
const listening = () => new Promise((done) => {
  const socket = connect(${port}, '127.0.0.1', () => { socket.end(); done(true); });
  socket.on('error', () => done(false));
});
while (!(await listening())) { await new Promise((wait) => setTimeout(wait, 50)); }`,
    );
    try {
      const evidence = await runTrial(
        {
          ...plan({ agent }),
          ports: [port],
          checks: passingChecks.map((check) =>
            check.name === 'e2e' ? { ...check, argv: ['node', '-e', portIsFree] } : check,
          ),
        },
        quietDeps({ isPortBusy: systemDeps().isPortBusy }),
      );

      expect(evidence.failures).toEqual([]);
      expect(evidence.result).toMatchObject({ status: 'passed', stoppedServers: [port] });
    } finally {
      try {
        process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL');
      } catch {
        // The harness stopped it.
      }
    }
  });

  it('looks for a stray server after the result commit, so one that starts late is still stopped', async () => {
    let committed = false;
    let stopped = false;
    const deps = quietDeps({
      isPortBusy: async () => committed && !stopped,
      stopListeners: async () => {
        stopped = true;
      },
    });
    const evidence = await runTrial(
      { ...plan({ agent: fakeAgent('late-server', WRITES_RESULT) }), ports: [5183] },
      {
        ...deps,
        exec: async (argv, options) => {
          committed ||= argv[0] === 'git' && argv.includes('commit');
          return deps.exec(argv, options);
        },
      },
    );

    expect(evidence.failures).toEqual([]);
    expect(evidence.result).toMatchObject({ status: 'passed', stoppedServers: [5183] });
  });

  it('fails a run whose agent left a server the harness cannot stop, naming the port', async () => {
    let calls = 0;
    const evidence = await runTrial(
      { ...plan({ agent: fakeAgent('unstoppable', WRITES_RESULT) }), ports: [5183] },
      quietDeps({
        isPortBusy: async () => {
          calls += 1;
          return calls > 1;
        },
        stopListeners: async () => undefined,
      }),
    );

    expect(evidence.result.status).toBe('failed');
    expect(evidence.failures).toEqual([
      'port 5183 stayed busy after the harness stopped the server the agent left on it',
    ]);
  });

  it('marks the trial as run before the agent starts, so a stopped harness leaves a final record', async () => {
    const copy = join(caseDir, 'provisional.json');
    const evidencePath = join(checkout, 'docs/trials/todo-01.json');
    const agent = fakeAgent(
      'provisional',
      `${WRITES_RESULT}\nwriteFileSync(${JSON.stringify(copy)}, readFileSync(${JSON.stringify(evidencePath)}));`,
    );

    await runTrial(plan({ agent }), quietDeps());

    const provisional = validateEvidence(JSON.parse(readFileSync(copy, 'utf8')));
    expect(provisional.run.agentExitCode).toBe(-1);
    expect(provisional.result.status).toBe('failed');
    expect(provisional.failures).toEqual(['the harness stopped while the agent ran']);
  });

  it('rewrites the record before the checks, so a harness stopped during one keeps the agent result', async () => {
    const copy = join(caseDir, 'during-checks.json');
    const evidencePath = join(checkout, 'docs/trials/todo-01.json');
    const base = plan({ agent: fakeAgent('during-checks', WRITES_RESULT) });
    const planned = {
      ...base,
      checks: [
        ...passingChecks.filter(({ name }) => name !== 'verify'),
        {
          name: 'verify',
          argv: [
            'node',
            '-e',
            `require('fs').copyFileSync(${JSON.stringify(evidencePath)}, ${JSON.stringify(copy)})`,
          ],
        },
      ],
    };

    const evidence = await runTrial(planned, quietDeps());

    const during = validateEvidence(JSON.parse(readFileSync(copy, 'utf8')));
    expect(during.failures).toEqual(['the harness stopped while the checks ran']);
    expect(during.run.agentExitCode).toBe(0);
    expect(during.run.agentDurationMs).toBe(evidence.run.agentDurationMs);
    expect(during.result.commit).toBe(evidence.result.commit);
    expect(evidence.result.status).toBe('passed');
  });

  it('rewrites the record before the stray-server sweep, naming that stage', async () => {
    const evidencePath = join(checkout, 'docs/trials/todo-01.json');
    const seen: string[][] = [];
    const agent = fakeAgent('during-sweep', WRITES_RESULT);

    await runTrial(
      plan({ agent }),
      quietDeps({
        isPortBusy: async () => {
          if (existsSync(evidencePath)) {
            seen.push(JSON.parse(readFileSync(evidencePath, 'utf8')).failures);
          }
          return false;
        },
      }),
    );

    expect(seen[0]).toEqual(['the harness stopped while it looked for servers the agent left']);
  });

  it('runs acceptance entries outside the scaffold after the agent starts', async () => {
    const agent = fakeAgent('local-acceptance', WRITES_RESULT);
    write(caseDir, 'accept.mjs', 'process.exit(0);');
    const base = plan({ agent });
    const evidence = await runTrial(
      {
        ...base,
        task: {
          ...base.task,
          acceptance: [{ name: 'acceptance', argv: ['node', join(caseDir, 'accept.mjs')] }],
        },
        checks: [
          ...base.checks,
          { name: 'acceptance', argv: ['node', join(caseDir, 'accept.mjs')] },
        ],
      },
      quietDeps(),
    );
    expect(evidence.result.status).toBe('passed');
    expect(evidence.checks.find(({ name }) => name === 'acceptance')?.exitCode).toBe(0);
  });

  it.each([
    'missing',
    'relative',
    'checkout',
    'nested',
    'symlink',
  ])('rejects %s external evidenceDir before creating a workdir', (kind) => {
    const base = plan({ agent: '/fake' });
    const link = join(caseDir, 'checkout-link');
    symlinkSync(checkout, link);
    const paths = {
      missing: undefined,
      relative: 'relative',
      checkout,
      nested: join(checkout, 'docs/new-evidence'),
      symlink: join(link, 'new-evidence'),
    };
    expect(() =>
      planTrial({
        ...base,
        task: {
          ...base.task,
          target: { repo: source, rev: scaffold },
          land: 'patch',
          evidenceDir: paths[kind],
        },
        now: new Date(),
      }),
    ).toThrow('task.evidenceDir');
    expect(readdirSync(base.trialsRoot)).toEqual([]);
  });

  it.each([
    [
      'a check whose script the scaffold lacks',
      {
        checks: [
          {
            name: 'structure',
            argv: ['node', 'tooling/architecture/structure.mjs'],
          },
        ],
      },
      'check structure needs tooling/architecture/structure.mjs, which the scaffold lacks',
    ],
    [
      'a check whose pnpm script the scaffold lacks',
      { checks: [{ name: 'verify', argv: ['pnpm', 'verify'] }] },
      'check verify needs verify, which the scaffold lacks',
    ],
  ])('fails before the agent starts on %s', async (_case, override, failure) => {
    write(checkout, 'package.json', '{ "scripts": {} }\n');
    const agent = fakeAgent('before-agent', WRITES_RESULT);
    git(checkout, 'add', 'package.json');
    git(checkout, 'commit', '-q', '-m', 'a manifest');

    const evidence = await runTrial(
      { ...plan({ agent, scaffoldRev: git(checkout, 'rev-parse', 'HEAD') }), ...override },
      quietDeps(),
    );

    expect(evidence.failures).toEqual([failure]);
    expect(evidence.run.agentExitCode).toBeNull();
    expect(evidence.stream).toEqual({ path: null, sha256: null, userTextEvents: null });
    expect(existsSync(`${agent}.call.json`)).toBe(false);
  });

  it('fails before the agent starts on a scaffold that already holds a showcase result', async () => {
    const agent = fakeAgent('result-in-scaffold', WRITES_RESULT);

    const evidence = await runTrial(plan({ agent, scaffoldRev: resultScaffold }), quietDeps());

    expect(evidence.failures).toEqual([
      'harness: the scaffold already holds showcase results: todo-09',
    ]);
    expect(existsSync(`${agent}.call.json`)).toBe(false);
  });

  it('refuses to start when the evidence for the trial exists, and leaves it unchanged', async () => {
    write(checkout, 'docs/trials/todo-01.json', '{ "kept": true }\n');
    const planned = plan({ agent: fakeAgent('refused', WRITES_RESULT) });

    await expect(runTrial(planned, quietDeps())).rejects.toThrow('docs/trials/todo-01.json exists');
    expect(readFileSync(join(checkout, 'docs/trials/todo-01.json'), 'utf8')).toBe(
      '{ "kept": true }\n',
    );
    expect(existsSync(planned.workdir)).toBe(false);
  });

  it('retries a failure from before the agent started and keeps the earlier failure', async () => {
    const first = await runTrial(
      {
        ...plan({ agent: fakeAgent('first-attempt', WRITES_RESULT) }),
        setup: [{ name: 'install', argv: ['node', '-e', 'process.exit(7)'] }],
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
  it('pins the Notes prompt to the scaffold and names its Codex plan', () => {
    const folder = join(sandbox, 'notes-dry-run');
    git(sandbox, 'clone', '-q', '--shared', source, folder);
    const taskPath = join(REPOSITORY_ROOT, 'tooling/trial/tasks/notes.json');
    const { task } = loadTask(taskPath);
    const template = readFileSync(join(REPOSITORY_ROOT, task.prompt), 'utf8');
    write(folder, task.prompt, template);
    git(folder, 'add', task.prompt);
    git(folder, 'commit', '-qm', 'Notes prompt fixture');
    const rev = git(folder, 'rev-parse', 'HEAD');
    write(folder, task.prompt, 'working tree prompt must not be read');
    const run = spawnSync(
      process.execPath,
      [
        CLI,
        '--trial',
        '2',
        '--agent',
        'codex',
        '--task',
        taskPath,
        '--scaffold',
        rev,
        '--trials-root',
        join(folder, 'trials'),
        '--dry-run',
      ],
      { cwd: folder, env: gitEnv, encoding: 'utf8' },
    );
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      id: 'notes-codex-02',
      branch: 'trial/notes-codex-02',
      scaffoldRev: rev,
      promptSha256: sha256(renderPrompt(template, { id: 'notes-codex-02', trial: 2 })),
      harness: { matchesScaffold: false },
    });
    expect(existsSync(join(folder, 'trials'))).toBe(false);
  });
  it('accepts an absolute task path and Codex fake-agent flags without a scaffold argument', () => {
    const folder = mkdtempSync(join(sandbox, 'cli-task-'));
    const target = join(folder, 'target.json');
    write(folder, 'prompt.md', 'Solve {{ID}}');
    writeFileSync(
      target,
      JSON.stringify({
        name: 'issue',
        prompt: 'prompt.md',
        target: { repo: source, rev: scaffold },
        allowedPaths: ['src/'],
        setup: [],
        checks: [],
        land: 'patch',
        evidenceDir: join(folder, 'evidence'),
      }),
    );
    const run = spawnSync(
      process.execPath,
      [
        CLI,
        '--trial',
        '2',
        '--task',
        target,
        '--agent',
        'codex',
        '--agent-command',
        '/fake/codex',
        '--trials-root',
        join(folder, 'trials'),
        '--dry-run',
      ],
      { cwd: source, env: gitEnv, encoding: 'utf8' },
    );
    expect(run.status).toBe(0);
    const printed = JSON.parse(run.stdout);
    expect(printed.id).toBe('issue-codex-02');
    expect(printed.scaffoldRev).toBe(scaffold);
    expect(printed.agentArgv[0]).toBe('/fake/codex');
    expect(printed.agentArgv).toContain('--dangerously-bypass-hook-trust');
    expect(printed.evidencePath).toBe(join(folder, 'evidence/issue-codex-02.json'));
    expect(existsSync(join(folder, 'trials'))).toBe(false);
  });

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
    expect(printed.privateEnv.TMPDIR).toBe(join(printed.workdir, 'tmp'));
    expect(printed.confinedEnv.TMPDIR).toBe('/tmp');
    expect(printed.checkConfinedEnv.XDG_RUNTIME_DIR).toBe('/tmp');
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

  it.each([
    '/',
    '/tmp/browsers',
    '',
  ])('refuses a Playwright browsers folder outside ~/.cache, such as %j, so the read allowlist cannot widen', (browsers) => {
    const run = spawnSync(
      process.execPath,
      [CLI, '--trial', '1', '--scaffold', scaffold, '--dry-run'],
      { cwd: source, env: { ...gitEnv, PLAYWRIGHT_BROWSERS_PATH: browsers }, encoding: 'utf8' },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('PLAYWRIGHT_BROWSERS_PATH must name a folder inside');
  });

  it('refuses a Playwright browsers folder that links out of ~/.cache', () => {
    const home = join(sandbox, 'linked-home');
    mkdirSync(join(home, '.cache/node/corepack'), { recursive: true });
    mkdirSync(join(sandbox, 'browsers-elsewhere'), { recursive: true });
    symlinkSync(join(sandbox, 'browsers-elsewhere'), join(home, '.cache/ms-playwright'));

    const run = spawnSync(
      process.execPath,
      [CLI, '--trial', '1', '--scaffold', scaffold, '--dry-run'],
      {
        cwd: source,
        env: {
          ...gitEnv,
          HOME: home,
          COREPACK_HOME: join(home, '.cache/node/corepack'),
          PLAYWRIGHT_BROWSERS_PATH: join(home, '.cache/ms-playwright'),
        },
        encoding: 'utf8',
      },
    );

    expect(run.stderr).toContain('PLAYWRIGHT_BROWSERS_PATH must name a folder inside');
    expect(run.status).toBe(1);
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
