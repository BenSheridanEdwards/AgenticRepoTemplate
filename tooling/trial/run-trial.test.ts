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
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
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

/** A TCP port nothing listens on, so a test never takes a trial port another process needs. */
const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });

const passingChecks = ['install', 'verify', 'e2e', 'structure'].map((name) => ({
  name,
  argv: ['true', name],
  timeoutMs: 30_000,
}));

function plan(options: { agent: string; trial?: number; scaffoldRev?: string; retry?: boolean }) {
  const trialsRoot = join(sandbox, `trials-${Math.random().toString(16).slice(2)}`);
  mkdirSync(trialsRoot);
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
      tmpDir: join(sandbox, 'tmp'),
      retry: options.retry ?? false,
    }),
    setup: [
      {
        name: 'install',
        argv: ['git', 'config', 'core.hooksPath', '.githooks'],
        timeoutMs: 30_000,
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
  sandbox = mkdtempSync(join(tmpdir(), 'run-trial-'));
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
    for (const flag of ['--resume', '-r', '--continue', '-c']) {
      expect(planned.agentArgv).not.toContain(flag);
    }
  });

  it('runs the four checks a passed run needs, on the committed result', () => {
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
  it('fills the committed template with the trial id and number', () => {
    const template = readFileSync(join(REPOSITORY_ROOT, 'tooling/trial/todo-prompt.md'), 'utf8');
    const planned = { id: 'todo-02', trial: 2 } as Parameters<typeof renderPrompt>[1];

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
    expect(() =>
      renderPrompt('Trial {{ID}} on {{DATE}}', { id: 'todo-01', trial: 1 } as never),
    ).toThrow('{{DATE}}');
  });
});

describe('runTrial', () => {
  // A run Jest gave up on keeps going, so each case gets its own evidence
  // checkout, agents and environment, where no later case looks.
  beforeEach(() => {
    process.env = { ...savedEnv, ...gitEnv };
    caseDir = mkdtempSync(join(sandbox, 'case-'));
    checkout = join(caseDir, 'checkout');
    git(sandbox, 'clone', '-q', '--shared', source, checkout);
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
          timeoutMs: 30_000,
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

  it('fails a run that writes outside its showcase folder and names the path', async () => {
    const agent = fakeAgent(
      'out-of-scope',
      `${WRITES_RESULT}\nput('apps/web/src/App.tsx', 'export const App = 2;\\n');`,
    );

    const evidence = await runTrial(plan({ agent }), quietDeps());

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
        join(homedir(), '.ssh/config'),
        planned.trialsRoot,
      ].sort(),
    );
    expect(evidence.result.status).toBe('failed');
  });

  it('passes a clean run whose agent reads its own session files, its scratch and caches, and cds about its clone', async () => {
    const tmp = join(sandbox, 'tmp');
    mkdirSync(tmp, { recursive: true });
    const planned = plan({ agent: join(caseDir, 'clean-agent.mjs') });
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
    fakeAgent(
      'clean-agent',
      `${WRITES_RESULT}
put(${JSON.stringify(join(tasks, 'b1.output'))}, 'verify ok\\n');
put(${JSON.stringify(scratch)}, 'notes\\n');
const tool = (name, input) => ({ type: 'tool_use', name, input });
const bash = (command) => tool('Bash', { command });
emit({ type: 'assistant', message: { content: [
  bash('pnpm verify > /dev/null 2>&1'),
  tool('Read', { file_path: ${JSON.stringify(join(tasks, 'b1.output'))} }),
  tool('Read', { file_path: ${JSON.stringify(toolResults)} }),
  tool('Read', { file_path: ${JSON.stringify(scratch)} }),
  bash('cat ${scratch}'),
  tool('Read', { file_path: '~/.cache/ms-playwright/chromium/INSTALLATION_COMPLETE' }),
  tool('Glob', { pattern: '*', path: ${JSON.stringify(join(homedir(), '.cache/node/corepack'))} }),
  bash('cd showcase/todo-01/web && ls ../..'),
  bash('ls ../../../apps'),
  bash('(cd src && ls ..) && ls ../../..'),
  bash('cd ../../.. && git status'),
  bash('cd .. && ls'),
  bash('cd ~/.cache && ls'),
  bash('ls ..'),
] } });`,
    );

    const evidence = await runTrial(planned, quietDeps());

    expect(evidence.result.outsideReads).toEqual([]);
    expect(evidence.result.status).toBe('passed');
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
      for (const name of Object.keys(parent)) {
        delete process.env[name];
      }
    }
    const env = JSON.parse(readFileSync(seen, 'utf8'));

    expect(env).toMatchObject({
      CLAUDE_CODE_OAUTH_TOKEN: 'token',
      ANTHROPIC_API_KEY: 'key',
      LC_ALL: 'C.UTF-8',
      HOME: process.env.HOME,
    });
    expect(env.PATH).toContain('/');
    for (const name of [
      'CLAUDECODE',
      'CLAUDE_CODE_SESSION_ID',
      'ANTHROPIC_MODEL',
      'MAX_THINKING_TOKENS',
      'DISABLE_AUTOUPDATER',
      'GIT_AUTHOR_NAME',
      'npm_lifecycle_event',
      'INIT_CWD',
    ]) {
      expect(env[name]).toBeUndefined();
    }
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
    '.size-limit.json',
    'lighthouserc.json',
    'jest.setup.ts',
    '.npmrc',
    '.mcp.json',
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
          timeoutMs: 30_000,
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
    const real = systemDeps();
    let committed = false;
    let stopped = false;
    const evidence = await runTrial(
      { ...plan({ agent: fakeAgent('late-server', WRITES_RESULT) }), ports: [5183] },
      quietDeps({
        exec: async (argv, options) => {
          committed ||= argv[0] === 'git' && argv[1] === 'commit';
          return real.exec(argv, options);
        },
        isPortBusy: async () => committed && !stopped,
        stopListeners: async () => {
          stopped = true;
        },
      }),
    );

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

  it.each([
    [
      'a check whose script the scaffold lacks',
      {
        checks: [
          {
            name: 'structure',
            argv: ['node', 'tooling/architecture/structure.mjs'],
            timeoutMs: 1_000,
          },
        ],
      },
      'check structure needs tooling/architecture/structure.mjs, which the scaffold lacks',
    ],
    [
      'a check whose pnpm script the scaffold lacks',
      { checks: [{ name: 'verify', argv: ['pnpm', 'verify'], timeoutMs: 1_000 }] },
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
