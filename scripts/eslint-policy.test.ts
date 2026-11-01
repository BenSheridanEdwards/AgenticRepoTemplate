/**
 * @jest-environment node
 */
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ESLint } from 'eslint';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface LintMessage {
  severity: number;
  line: number;
  message: string;
  ruleId: string | null;
}

interface LintResult {
  exitCode: number | null;
  ruleIds: string[];
  messages: LintMessage[];
  output: string;
}

// One ESLint process for the whole file: it loads eslint.config.js once, as the CLI
// does, outside Jest's VM (which cannot load the ESM config), one JSON line per request.
const WORKER = `
import { createInterface } from 'node:readline';
import { ESLint } from 'eslint';
const eslint = new ESLint();
const ops = {
  lintText: ({ source, filePath }) => eslint.lintText(source, { filePath }),
  lintFiles: ({ patterns }) => eslint.lintFiles(patterns),
};
for await (const line of createInterface({ input: process.stdin })) {
  const { id, ...request } = JSON.parse(line);
  try {
    const result = await ops[request.op](request);
    process.stdout.write(JSON.stringify({ id, result }) + '\\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ id, error: String(error?.stack ?? error) }) + '\\n');
  }
}
`;

type WorkerRequest =
  | { op: 'lintText'; source: string; filePath: string }
  | { op: 'lintFiles'; patterns: string[] };

interface WorkerReply {
  id: number;
  result?: ESLint.LintResult[];
  error?: string;
}

const worker = spawn(process.execPath, ['--input-type=module', '-e', WORKER], {
  cwd: REPOSITORY_ROOT,
  stdio: ['pipe', 'pipe', 'inherit'],
});
const pending = new Map<number, (reply: WorkerReply) => void>();
let nextId = 0;
let buffered = '';
worker.stdout.setEncoding('utf8');
worker.stdout.on('data', (chunk: string) => {
  const lines = `${buffered}${chunk}`.split('\n');
  buffered = lines.pop() ?? '';
  lines.forEach((line) => {
    const reply: WorkerReply = JSON.parse(line);
    pending.get(reply.id)?.(reply);
    pending.delete(reply.id);
  });
});
afterAll(() => worker.kill());

function ask(request: WorkerRequest): Promise<WorkerReply['result']> {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, (reply) => {
      if (reply.error === undefined) resolve(reply.result);
      else reject(new Error(reply.error));
    });
    worker.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
  });
}

const asResults = (result: WorkerReply['result']): ESLint.LintResult[] =>
  Array.isArray(result) ? result : [];

const lintFiles = async (patterns: string[]) => asResults(await ask({ op: 'lintFiles', patterns }));

/** Lints `source` through the real ESLint config as if it lived at `filename`. */
async function lintPolicy(
  source: string,
  filename = 'apps/web/src/features/policy/Fixture.tsx',
): Promise<LintResult> {
  const results = asResults(
    await ask({ op: 'lintText', source, filePath: join(REPOSITORY_ROOT, filename) }),
  );
  const messages: LintMessage[] = results.flatMap((result) => result.messages);
  const problems = results.reduce(
    (sum, result) => sum + result.errorCount + result.warningCount,
    0,
  );
  const ruleIds = messages.map((message) => message.ruleId ?? 'parse-error');
  return { exitCode: problems > 0 ? 1 : 0, ruleIds, messages, output: JSON.stringify(results) };
}

describe('ESLint policy stack', () => {
  jest.setTimeout(60_000);

  it('blocks a hook called inside a condition (react-hooks/rules-of-hooks)', async () => {
    const result = await lintPolicy(`
import { useState } from 'react';
export function Toggle({ enabled }: { enabled: boolean }) {
  if (enabled) {
    useState(0);
  }
  return <p>toggle</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/rules-of-hooks');
  });

  it('blocks impure work during render (React Compiler react-hooks/purity)', async () => {
    const result = await lintPolicy(`
export function Lottery() {
  const ticket = Math.random();
  return <p>{ticket}</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/purity');
  });

  it('blocks a React Doctor finding (react-doctor/no-fetch-in-effect)', async () => {
    const result = await lintPolicy(`
import { useEffect } from 'react';
export function Loader() {
  useEffect(() => {
    void fetch('/api/service-status');
  }, []);
  return <p>loading</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-doctor/no-fetch-in-effect');
  });

  it('blocks state mirrored from a prop by an effect (react-hooks/set-state-in-effect)', async () => {
    const result = await lintPolicy(
      `
import { useEffect, useState } from 'react';
export function useMirror(value: number) {
  const [copy, setCopy] = useState(value);
  useEffect(() => {
    setCopy(value);
  }, [value]);
  return copy;
}
`,
      'apps/web/src/features/policy/useMirror.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/set-state-in-effect');
  });

  it('blocks a class component (react-doctor/prefer-function-component)', async () => {
    const result = await lintPolicy(`
import { Component } from 'react';
export class Fixture extends Component {
  render() {
    return <p />;
  }
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-doctor/prefer-function-component');
  });
});

describe('ESLint inline config', () => {
  jest.setTimeout(60_000);
  // Split, so this file holds no inline config of its own.
  const ESLINT = 'eslint';

  it.each([
    'apps/web/src/routes/greeting/GreetingPage.tsx',
    'apps/web/src/App.test.tsx',
    'apps/web/e2e/greeting.spec.ts',
    'apps/api/src/server.ts',
    'packages/ui/src/index.ts',
    'showcase/x/web/src/App.tsx',
    'tooling/architecture/structure.mjs',
    'tooling/trial/compare.test.ts',
    'scripts/check-suppressions.mjs',
    'playwright.config.ts',
  ])('blocks every inline config form in %s', async (filename) => {
    const forms = [
      `/* ${ESLINT}-disable */`,
      `/* ${ESLINT}-enable */`,
      `// ${ESLINT}-disable-next-line policy/handler-names -- a stated reason`,
      `export const one = 1; // ${ESLINT}-disable-line`,
      `/* ${ESLINT} policy/one-component-per-file: off */`,
      '/* global document */',
      `/* ${ESLINT}-env node */`,
      '/* exported one */',
    ];
    const result = await lintPolicy(`${forms.join('\n\n')}\n`, filename);

    expect(result.exitCode).toBe(1);
    expect(
      result.messages.map(({ line, message }) => [line, /noInlineConfig/.test(message)]),
    ).toEqual(forms.map((_, index) => [index * 2 + 1, true]));
  });

  it('keeps a suppressed finding reported when a disable comment names its rule', async () => {
    const result = await lintPolicy(`
export function Fixture() {
  return <Badge />;
}
// ${ESLINT}-disable-next-line policy/one-component-per-file -- a stated reason
function Badge() {
  return <span>new</span>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/one-component-per-file');
  });

  it('lints every tracked source file', async () => {
    const tracked = spawnSync(
      'git',
      ['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
    )
      .stdout.split('\n')
      .filter((path) => path && !path.startsWith('vendor/'));
    const results = await lintFiles(['.']);
    const linted = results.map(({ filePath }) => filePath.slice(REPOSITORY_ROOT.length + 1));

    expect(tracked.length).toBeGreaterThan(100);
    expect(tracked.filter((path) => !linted.includes(path))).toEqual([]);
  });
});
