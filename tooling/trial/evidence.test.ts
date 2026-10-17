/**
 * @jest-environment node
 */
import { validateEvidence } from './evidence.mjs';

const REV = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

const passed = () => ({
  schema: 1,
  trial: { number: 2, id: 'todo-02', branch: 'trial/todo-02', workdir: 'todo-02-20261017T120000Z' },
  prompt: {
    path: 'tooling/trial/todo-prompt.md',
    templateSha256: SHA256,
    sha256: SHA256,
    text: '# Todo trial todo-02\n',
  },
  scaffold: { rev: REV, enforcementRev: REV, lockfileSha256: SHA256 },
  harness: { sha256: SHA256, matchesScaffold: true },
  agent: {
    cli: 'claude',
    version: '2.1.300 (Claude Code)',
    argv: ['claude', '-p', '--model', 'opus'],
    sessionId: '0b7f6c1e-3f7a-4d2b-9c51-2f0e8f6b2a10',
    resolvedModel: 'claude-opus-5-5',
    userConfigSha256: SHA256,
    fake: false,
  },
  run: {
    startedAt: '2026-10-17T12:00:00.000Z',
    finishedAt: '2026-10-17T13:00:00.000Z',
    durationMs: 3_600_000,
    agentExitCode: 0,
    agentDurationMs: 3_000_000,
    turns: 120,
    costUsd: 12.5,
  },
  result: {
    status: 'passed',
    commit: REV,
    changedPaths: ['pnpm-lock.yaml', 'showcase/todo-02/web/package.json'],
    outsideScope: [],
    outsideReads: [],
    patch: null,
  },
  stream: { path: 'docs/trials/todo-02.stream.jsonl', sha256: SHA256, userTextEvents: 0 },
  checks: ['install', 'verify', 'e2e', 'structure'].map((name) => ({
    name,
    command: name,
    exitCode: 0,
    durationMs: 1_000,
    outputTail: 'ok',
  })),
  failures: [],
  retries: [],
});

/** Every key path of a value, objects only (array items are covered by their own cases). */
function keyPaths(value: unknown, prefix: string[] = []): string[][] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [
    [...prefix, key],
    ...keyPaths(child, [...prefix, key]),
  ]);
}

function without(path: string[]) {
  const value: Record<string, unknown> = passed();
  const parent = path
    .slice(0, -1)
    .reduce((node, key) => node[key] as Record<string, unknown>, value);
  delete parent[path.at(-1) as string];
  return value;
}

describe('validateEvidence', () => {
  it('returns a complete evidence record unchanged', () => {
    expect(validateEvidence(passed())).toEqual(passed());
  });

  it('accepts a failure from before the agent started, with no agent result', () => {
    const failed = passed();
    Object.assign(failed.run, {
      agentExitCode: null,
      agentDurationMs: null,
      turns: null,
      costUsd: null,
    });
    Object.assign(failed.agent, { resolvedModel: null });
    Object.assign(failed.result, {
      status: 'failed',
      commit: null,
      changedPaths: [],
      patch: null,
    });
    failed.checks = [];
    failed.failures = ['pnpm install --frozen-lockfile exited 1'];

    expect(validateEvidence(failed)).toEqual(failed);
  });

  it.each(
    keyPaths(passed()).map((path) => [path.join('.')]),
  )('throws when %s is missing', (path) => {
    expect(() => validateEvidence(without(path.split('.')))).toThrow(`evidence.${path}`);
  });

  it.each([
    ['schema', ['schema'], 2],
    ['a trial number outside 1..3', ['trial', 'number'], 4],
    ['an id that does not match the number', ['trial', 'id'], 'todo-03'],
    ['an absolute workdir', ['trial', 'workdir'], '/workspace/mono/scratch/trials/todo-02-x'],
    ['a short scaffold rev', ['scaffold', 'rev'], 'abc123'],
    ['a non-hex prompt hash', ['prompt', 'sha256'], 'z'.repeat(64)],
    ['a session id that is not a UUID', ['agent', 'sessionId'], 'session-1'],
    ['an unknown status', ['result', 'status'], 'skipped'],
    ['a string exit code', ['run', 'agentExitCode'], '0'],
  ])('throws on %s', (_case, path, bad) => {
    const value = passed();
    const parent = path
      .slice(0, -1)
      .reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, value);
    parent[path.at(-1) as string] = bad;

    expect(() => validateEvidence(value)).toThrow(`evidence.${path.join('.')}`);
  });

  it('accepts an earlier attempt that failed before the agent started', () => {
    const value = passed();
    value.retries = [
      { startedAt: '2026-10-17T11:00:00.000Z', failures: ['setup install exited 1'] },
    ] as never;

    expect(validateEvidence(value)).toEqual(value);
  });

  it('throws on an earlier attempt without its failures', () => {
    const value = passed();
    value.retries = [{ startedAt: '2026-10-17T11:00:00.000Z' }] as never;

    expect(() => validateEvidence(value)).toThrow('evidence.retries[0].failures');
  });

  it('throws on a field the schema does not name', () => {
    expect(() => validateEvidence({ ...passed(), notes: 'hand edited' })).toThrow('evidence.notes');
  });

  it('throws on a check without its exit code', () => {
    const value = passed();
    value.checks = [
      { name: 'verify', command: 'pnpm verify', durationMs: 1, outputTail: '' } as never,
    ];

    expect(() => validateEvidence(value)).toThrow('evidence.checks[0].exitCode');
  });

  it.each([
    [
      'a failed check',
      (value: ReturnType<typeof passed>) =>
        ((value.checks[0] as { exitCode: number }).exitCode = 1),
    ],
    [
      'no commit',
      (value: ReturnType<typeof passed>) => Object.assign(value.result, { commit: null }),
    ],
    [
      'a path outside the scope',
      (value: ReturnType<typeof passed>) => value.result.outsideScope.push('apps/web/src/App.tsx'),
    ],
    [
      'no kept stream',
      (value: ReturnType<typeof passed>) => {
        value.stream = { path: null, sha256: null, userTextEvents: null } as never;
      },
    ],
    [
      'a read outside the clone',
      (value: ReturnType<typeof passed>) => value.result.outsideReads.push('/workspace/mono/pr5'),
    ],
    [
      'a recorded failure',
      (value: ReturnType<typeof passed>) => value.failures.push('agent exited 1'),
    ],
    ['the e2e check missing', (value: ReturnType<typeof passed>) => value.checks.splice(2, 1)],
    ['no check at all', (value: ReturnType<typeof passed>) => value.checks.splice(0)],
  ])('throws on a passed status with %s', (_case, spoil) => {
    const value = passed();
    spoil(value);

    expect(() => validateEvidence(value)).toThrow('evidence.result.status');
  });

  it('throws on a failed status with no failure named', () => {
    const value = passed();
    value.result.status = 'failed';

    expect(() => validateEvidence(value)).toThrow('evidence.failures');
  });
});
