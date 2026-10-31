/**
 * @jest-environment node
 */
import { spawn, spawnSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ESLint } from 'eslint';
import { Linter } from 'eslint';
import policy from '../tooling/eslint-plugin-policy.js';

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
  config: async ({ filePath }) => (await eslint.calculateConfigForFile(filePath)) ?? null,
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

interface PrintedConfig {
  rules: Record<string, [number, ...string[]]>;
}

type WorkerRequest =
  | { op: 'lintText'; source: string; filePath: string }
  | { op: 'lintFiles'; patterns: string[] }
  | { op: 'config'; filePath: string };

interface WorkerReply {
  id: number;
  result?: ESLint.LintResult[] | PrintedConfig | null;
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

/** The resolved config for `path`, as `eslint --print-config` prints it; undefined when ignored. */
async function printConfig(path: string): Promise<PrintedConfig | undefined> {
  const config = await ask({ op: 'config', filePath: join(REPOSITORY_ROOT, path) });
  return config === null || Array.isArray(config) ? undefined : config;
}

describe('ESLint policy stack', () => {
  jest.setTimeout(60_000);

  it.each([
    'ts',
    'tsx',
    'mts',
    'cts',
    'js',
    'jsx',
    'mjs',
    'cjs',
  ])('rejects parameter mutation and accepts a returned copy in %s', async (extension) => {
    const filename = `scripts/parameter-fixture.${extension}`;
    const mutation = await lintPolicy('function f(item) { item.x = 1; }', filename);
    expect(mutation.exitCode).toBe(1);
    expect(mutation.ruleIds).toEqual(['no-param-reassign']);
    expect(mutation.messages[0]?.severity).toBe(2);
    const copy = await lintPolicy('function f(item) { return { ...item, x: 1 }; }', filename);
    expect(copy.exitCode).toBe(0);
    expect(copy.ruleIds).toEqual([]);
  });

  it('turns on every local policy rule as an error for apps/web/src/', async () => {
    const { rules } = (await printConfig('apps/web/src/App.tsx')) ?? { rules: {} };
    Object.keys(policy.rules).forEach((rule) => {
      expect([`policy/${rule}`, rules[`policy/${rule}`]?.[0]]).toEqual([`policy/${rule}`, 2]);
    });
  });

  it('ignores build output inside a workspace package', async () => {
    expect(await printConfig('apps/web/dist/assets/index.js')).toBeUndefined();
  });

  it('ignores the gitignored type-check and diagram cache', async () => {
    expect(await printConfig('.cache/types/apps/web/src/App.d.ts')).toBeUndefined();
  });

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

  it('passes a clean component', async () => {
    const result = await lintPolicy(`
export function Fixture({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('leaves general lint such as unused variables to Biome', async () => {
    const result = await lintPolicy(`
export function Fixture() {
  const unused = 1;
  return <p>Hello</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['for...of', 'for (const value of [1]) { console.log(value); }'],
    ['while', 'while (false) { console.log(1); }'],
  ])('fails a %s loop', async (_, source) => {
    const result = await lintPolicy(source, 'scripts/loop-fixture.js');
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('no-restricted-syntax');
  });

  it('passes for await', async () => {
    const result = await lintPolicy(
      'async function consume(values) { for await (const value of values) { console.log(value); } }',
      'scripts/loop-fixture.js',
    );
    expect(result.exitCode).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it('blocks a second component in one file (policy/one-component-per-file)', async () => {
    const result = await lintPolicy(`
export function Fixture() {
  return <Badge />;
}
function Badge() {
  return <span>new</span>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/one-component-per-file');
  });

  it.each([
    ['useState', "import { useState } from 'react';", 'useState(0);'],
    ['useEffect', "import { useEffect } from 'react';", 'useEffect(() => {}, []);'],
    [
      'an aliased useReducer',
      "import { useReducer as useStore } from 'react';",
      'useStore((x: number) => x, 0);',
    ],
    [
      'React.useLayoutEffect',
      "import * as React from 'react';",
      'React.useLayoutEffect(() => {}, []);',
    ],
  ])('blocks %s called directly in a component (policy/state-and-effects-in-hooks)', async (_label, importLine, call) => {
    const result = await lintPolicy(`
${importLine}
export function Fixture() {
  ${call}
  return <p>state</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/state-and-effects-in-hooks');
  });

  it('passes state and effects inside a named custom hook', async () => {
    const result = await lintPolicy(
      `
import { useEffect, useState } from 'react';
export function useTitle(title: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return { count, handleIncrement: () => setCount((current) => current + 1) };
}
`,
      'apps/web/src/features/policy/useTitle.ts',
    );
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
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

  it('blocks a function inside a component without the handle prefix (policy/handler-names)', async () => {
    const result = await lintPolicy(`
import { Button } from '@repo/ui';
export function Fixture({ onSave }: { onSave: () => void }) {
  const save = () => onSave();
  return <Button type="button" onClick={save}>Save</Button>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/handler-names');
  });

  it('passes handle-prefixed functions and on-prefixed callback props', async () => {
    const result = await lintPolicy(`
import { Button } from '@repo/ui';
interface FixtureProps {
  label: string;
  onSave: () => void;
}
export function Fixture({ label, onSave }: FixtureProps) {
  const handleClick = () => onSave();
  return <Button type="button" onClick={handleClick}>{label}</Button>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['an inline props type', 'export function Fixture({ save }: { save: () => void }) {'],
    [
      'a props interface',
      'interface FixtureProps { save(): void }\nexport function Fixture({ save }: FixtureProps) {',
    ],
  ])('blocks a callback prop without the on prefix in %s (policy/callback-prop-names)', async (_label, header) => {
    const result = await lintPolicy(`
${header}
  return <Button type="button" onClick={save}>Save</Button>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/callback-prop-names');
  });

  it('blocks a page component outside apps/web/src/routes (policy/pages-in-routes)', async () => {
    const result = await lintPolicy(
      `
export function SettingsPage() {
  return <main>settings</main>;
}
`,
      'apps/web/src/features/settings/SettingsPage.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/pages-in-routes');
  });

  it('blocks a page component under a src/routes folder nested inside a feature', async () => {
    const result = await lintPolicy(
      'export function SettingsPage() {\n  return <main>settings</main>;\n}',
      'apps/web/src/features/settings/src/routes/SettingsPage.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/pages-in-routes');
  });

  it('passes a page component under apps/web/src/routes', async () => {
    const result = await lintPolicy(
      `
export function SettingsPage() {
  return <main>settings</main>;
}
`,
      'apps/web/src/routes/settings/SettingsPage.tsx',
    );
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    [
      'a component',
      'apps/web/src/features/policy/Widget.tsx',
      'export function Fixture() {\n  return <p />;\n}',
    ],
    [
      'a hook',
      'apps/web/src/features/policy/hooks.ts',
      'export function useFixture() {\n  return 1;\n}',
    ],
  ])('blocks %s in a file of another name (policy/file-matches-export)', async (_label, filename, source) => {
    const result = await lintPolicy(source, filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/file-matches-export');
  });

  it('blocks a folder that is not kebab-case (policy/folder-names)', async () => {
    const result = await lintPolicy(
      'export function Fixture() {\n  return <p />;\n}',
      'apps/web/src/features/ThresholdCounter/Fixture.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/folder-names');
  });

  it.each([
    ['utils', 'apps/web/src/routes/greeting/utils/x.ts', 'src/routes/greeting/utils'],
    ['helpers', 'apps/web/src/features/name-input/helpers/x.ts', 'src/features/name-input/helpers'],
    ['lib', 'apps/api/src/features/greeting/lib/x.ts', 'src/features/greeting/lib'],
    ['common', 'packages/ui/src/common/x.ts', 'src/common'],
    ['shared', 'showcase/todo-02/web/src/shared/x.ts', 'src/shared'],
    ['misc', 'apps/web/src/routes/greeting/parts/misc/x.ts', 'src/routes/greeting/parts/misc'],
  ])('blocks %s in a catch-all folder (policy/role-named-folders)', async (_label, filename, folder) => {
    const result = await lintPolicy('export const x = 1;\n', filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/role-named-folders']);
    expect(result.messages[0]?.message).toContain(`\`${folder}/\``);
    expect(result.messages[0]?.message).toContain('`@repo/ui`');
  });

  it.each([
    ['a package named lib', 'packages/lib/src/x.ts'],
    ['a role folder that contains a catch-all word', 'apps/web/src/features/shared-state/x.ts'],
  ])('passes %s (policy/role-named-folders)', async (_label, filename) => {
    const result = await lintPolicy('export const x = 1;\n', filename);
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    [
      'a test with no subject',
      'apps/web/src/routes/greeting/Foo.test.tsx',
      'apps/web/src/routes/greeting/Foo',
    ],
    [
      'an a11y test with no subject',
      'apps/web/src/routes/greeting/Missing.a11y.test.tsx',
      'apps/web/src/routes/greeting/Missing',
    ],
    [
      'a test in a __tests__ folder',
      'apps/web/src/routes/greeting/__tests__/GreetingPage.test.tsx',
      'apps/web/src/routes/greeting/GreetingPage',
    ],
  ])('blocks %s (policy/test-beside-subject)', async (_label, filename, subject) => {
    const result = await lintPolicy('export const value = 1;\n', filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/test-beside-subject']);
    expect(result.messages[0]?.message).toContain(`\`${subject}.ts\` or`);
  });

  it.each([
    ['apps/api/src/features/greeting/domain.test.ts'],
    ['packages/ui/src/Button.test.tsx'],
    ['apps/web/src/routes/greeting/GreetingPage.a11y.test.tsx'],
  ])('passes %s beside its subject (policy/test-beside-subject)', async (filename) => {
    const result = await lintPolicy('export const value = 1;\n', filename);
    expect(result.ruleIds).toEqual([]);
  });

  it('passes a showcase test beside its subject (policy/test-beside-subject)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'policy-showcase-'));
    const folder = join(root, 'showcase/todo-01/web/src/routes/todos');
    try {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'useTodos.ts'), 'export const useTodos = () => [];\n');
      const messages = new Linter({ cwd: root }).verify(
        'export const value = 1;\n',
        {
          files: ['**/*.tsx'],
          plugins: { policy },
          rules: { 'policy/test-beside-subject': 'error' },
        },
        join(folder, 'useTodos.test.tsx'),
      );
      expect(messages).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes a test beside a dotted subject such as todo.schema.ts (policy/test-beside-subject)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'policy-dotted-'));
    const folder = join(root, 'apps/api/src/features/todos');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'todo.schema.ts'), 'export const schema = 1;\n');
    const lint = (name: string) =>
      new Linter({ cwd: root }).verify(
        'export const value = 1;\n',
        {
          files: ['**/*.ts'],
          plugins: { policy },
          rules: { 'policy/test-beside-subject': 'error' },
        },
        join(folder, name),
      );
    try {
      expect(lint('todo.schema.test.ts')).toEqual([]);
      expect(lint('todo.other.test.ts').map(({ message }) => message)).toEqual([
        expect.stringContaining('`apps/api/src/features/todos/todo.ts` or'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds no catch-all folder or misplaced test in the tree', async () => {
    const files = globSync('{apps,packages,showcase}/**/*.{ts,tsx}', {
      cwd: REPOSITORY_ROOT,
      exclude: ['**/node_modules/**', '**/dist/**'],
    });
    const roots = ['apps', 'packages', 'showcase'].filter((root) =>
      files.some((file) => file.startsWith(`${root}/`)),
    );
    const results = await lintFiles(roots);
    expect(
      results.reduce((sum, result) => sum + result.errorCount + result.fatalErrorCount, 0),
    ).toBe(0);
    const findings = results.flatMap(({ filePath, messages }) =>
      messages
        .filter(({ ruleId }) =>
          ['policy/role-named-folders', 'policy/test-beside-subject'].includes(ruleId ?? ''),
        )
        .map(({ ruleId }) => `${filePath.slice(REPOSITORY_ROOT.length + 1)} ${ruleId}`),
    );
    const tests = results.filter(({ filePath }) => /\.test\.tsx?$/.test(filePath));

    expect(findings).toEqual([]);
    expect(tests.map(({ filePath }) => filePath).sort()).toEqual(
      files
        .filter((file) => /\.test\.tsx?$/.test(file))
        .map((file) => join(REPOSITORY_ROOT, file))
        .sort(),
    );
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

  it('blocks a deep import past a public surface (no-restricted-imports)', async () => {
    const result = await lintPolicy(
      "export { useServiceStatus } from '../features/service-status/useServiceStatus';",
      'apps/web/src/routes/home/index.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('no-restricted-imports');
  });

  it('names the helper, not the exported component, when a helper comes first', async () => {
    const result = await lintPolicy(`
function Icon() {
  return <span>!</span>;
}
export function Fixture() {
  return <Icon />;
}
`);
    expect(result.ruleIds).toEqual(['policy/one-component-per-file']);
    expect(result.output).toContain('Move `Icon` into its own file');
  });

  it('leaves a test harness component alone', async () => {
    const result = await lintPolicy(
      `
import { useState } from 'react';
export function Harness() {
  const [value, setValue] = useState(0);
  const bump = () => setValue(value + 1);
  return <button type="button" onClick={bump}>{value}</button>;
}
`,
      'apps/web/src/App.test.tsx',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    [
      'useActionState',
      "import { useActionState } from 'react';",
      'useActionState(async (x: number) => x, 0);',
    ],
  ])('blocks %s in a component (policy/state-and-effects-in-hooks)', async (_label, importLine, call) => {
    const result = await lintPolicy(`
${importLine}
export function Fixture() {
  ${call}
  return <p>state</p>;
}
`);
    expect(result.ruleIds).toContain('policy/state-and-effects-in-hooks');
  });

  it('blocks a React.useCallback without the handle prefix (policy/handler-names)', async () => {
    const result = await lintPolicy(`
import * as React from 'react';
import { Button } from '@repo/ui';
export function Fixture({ onSave }: { onSave: () => void }) {
  const save = React.useCallback(() => onSave(), [onSave]);
  return <Button type="button" onClick={save}>Save</Button>;
}
`);
    expect(result.ruleIds).toContain('policy/handler-names');
  });

  it.each([
    [
      'an intersection',
      'type FixtureProps = { label: string } & { save?: () => void };\nexport function Fixture({ save }: FixtureProps) {',
    ],
    [
      'an extended interface',
      'interface Base { save(): void }\ninterface FixtureProps extends Base { label: string }\nexport function Fixture({ save }: FixtureProps) {',
    ],
    [
      'FC<Props>',
      "import type { FC } from 'react';\ninterface FixtureProps { save: () => void }\nexport const Fixture: FC<FixtureProps> = ({ save }) => {",
    ],
  ])('blocks a callback prop without the on prefix through %s (policy/callback-prop-names)', async (_label, header) => {
    const result = await lintPolicy(`
${header}
  return <Button type="button" onClick={save}>Save</Button>;
};
`);
    expect(result.ruleIds).toContain('policy/callback-prop-names');
  });

  it('passes render props and children', async () => {
    const result = await lintPolicy(`
import type { ReactNode } from 'react';
interface FixtureProps {
  renderItem: (item: string) => ReactNode;
  children: (open: boolean) => ReactNode;
}
export function Fixture({ renderItem, children }: FixtureProps) {
  return <ul>{renderItem('one')}{children(true)}</ul>;
}
`);
    expect(result.ruleIds).toEqual([]);
  });

  it('passes a __tests__ folder (policy/folder-names)', async () => {
    const result = await lintPolicy(
      'export const value = 1;',
      'apps/web/src/features/policy/__tests__/value.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });
});

describe('ESLint contract rules', () => {
  jest.setTimeout(60_000);

  it.each([
    'apps/api/src/router.ts',
    'packages/ui/src/Button.tsx',
    'showcase/todo-01/web/src/App.tsx',
    'showcase/todo-01/api/src/features/todo/procedures.ts',
  ])('turns on every local policy rule as an error for %s', async (path) => {
    const { rules } = (await printConfig(path)) ?? { rules: {} };
    Object.keys(policy.rules).forEach((rule) => {
      expect([`policy/${rule}`, rules[`policy/${rule}`]?.[0]]).toEqual([`policy/${rule}`, 2]);
    });
  });

  it('passes a router that imports a feature through its index.ts with an explicit extension', async () => {
    const result = await lintPolicy(
      "export { greetingRouter } from './features/greeting/index.ts';",
      'apps/api/src/router.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it('blocks a router that reaches past a feature index.ts (no-restricted-imports)', async () => {
    const result = await lintPolicy(
      "export { formatGreeting } from './features/greeting/domain.ts';",
      'apps/api/src/router.ts',
    );
    expect(result.ruleIds).toEqual(['no-restricted-imports']);
  });

  it('blocks a route that reaches past the api client index.ts (no-restricted-imports)', async () => {
    const result = await lintPolicy(
      "export { createQueryClient } from '../../api-client/trpc';",
      'apps/web/src/routes/greeting/index.ts',
    );
    expect(result.ruleIds).toEqual(['no-restricted-imports']);
  });

  it.each([
    ['an alias', "export { useQuery as useQ } from '@tanstack/react-query';"],
    ['everything', "export * from 'react-hook-form';"],
  ])('blocks re-exporting a state hook module as %s (policy/state-and-effects-in-hooks)', async (_label, source) => {
    const result = await lintPolicy(source, 'apps/web/src/routes/greeting/hooks.ts');
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/state-and-effects-in-hooks']);
  });

  it.each([
    ['a route imports another route', 'apps/web/src/routes/a/A.tsx', "import { B } from '../b';"],
    [
      'a backend feature imports another feature',
      'apps/api/src/features/a/application.ts',
      "import { formatB } from '../b/domain.ts';",
    ],
    [
      'a web feature imports another feature',
      'apps/web/src/features/a/useA.ts',
      "import { b } from '../b/b';",
    ],
    [
      'a showcase route imports another route',
      'showcase/todo-01/web/src/routes/a/A.tsx',
      "import { B } from '../b';",
    ],
    ['a route requires another route', 'apps/web/src/routes/a/a.ts', "const b = require('../b');"],
    [
      'a route imports another route through a template literal',
      'apps/web/src/routes/a/a.ts',
      'const b = import(`../b`);',
    ],
    [
      'a route import-equals another route',
      'apps/web/src/routes/a/a.ts',
      "import b = require('../b');",
    ],
    [
      'a relative import leaves its package',
      'apps/web/src/routes/a/A.tsx',
      "import type { AppRouter } from '../../../../api/src/router.ts';",
    ],
  ])('blocks %s (policy/slice-isolation)', async (_label, filename, source) => {
    const result = await lintPolicy(`${source}\nexport const value = 1;\n`, filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/slice-isolation']);
  });

  it.each([
    ['apps/web/src/features/loose.ts'],
    ['apps/web/src/routes/loose.ts'],
    ['apps/api/src/features/loose.ts'],
    ['showcase/todo-01/web/src/features/loose.ts'],
  ])('blocks the loose file %s directly under a slice folder (policy/slice-isolation)', async (filename) => {
    const result = await lintPolicy(
      "import { a } from './a';\nimport { b } from './b';\nexport const loose = [a, b];\n",
      filename,
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/slice-isolation']);
    expect(result.output).toContain('into a folder of its own');
  });

  it('passes a route that imports its own files, a feature, the api client and the ui kit', async () => {
    const result = await lintPolicy(
      [
        "import { Button } from '@repo/ui';",
        "import { useTrpc } from '../../api-client';",
        "import { nameInput } from '../../features/name-input';",
        "import { greetingFormSchema } from './greetingFormSchema';",
        'export const value = [Button, useTrpc, nameInput, greetingFormSchema];',
      ].join('\n'),
      'apps/web/src/routes/greeting/value.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    ['a cast instead of a schema', '.input((value) => value as { name: string })'],
    ['a bare Effect schema', '.input(greetInputSchema)'],
    ['another standard schema', '.input(z.object({ name: z.string() }))'],
    ['a cast through a computed member', "['input']((value) => value as { name: string })"],
    ['the Effect 3 adapter', '.input(Schema.standardSchemaV1(greetInputSchema))'],
  ])('blocks a procedure input given %s (policy/procedure-input-schema)', async (_label, input) => {
    const result = await lintPolicy(
      `
import { Schema } from 'effect';
import { z } from 'zod';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure${input}.query(({ input }) => input);
export const unused = [z, greetInputSchema];
`,
      'apps/api/src/features/greeting/procedures.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/procedure-input-schema']);
  });

  it('passes a procedure input wrapped in toStandardSchemaV1 from effect/Schema', async () => {
    const result = await lintPolicy(
      `
import * as Schema from 'effect/Schema';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.toStandardSchemaV1(greetInputSchema)).query(({ input }) => input);
`,
      'apps/api/src/features/greeting/procedures.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it('passes a procedure input wrapped in Schema.toStandardSchemaV1', async () => {
    const result = await lintPolicy(
      `
import { Schema } from 'effect';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.toStandardSchemaV1(greetInputSchema)).query(({ input }) => input);
`,
      'apps/api/src/features/greeting/procedures.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    ['no options', 'useForm()'],
    ['no resolver', "useForm({ defaultValues: { name: '' } })"],
    ['another resolver', 'useForm({ resolver: zodResolver(schema) })'],
    ['options built elsewhere', 'useForm(options)'],
    [
      'a spread after the resolver',
      'useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema)), ...options })',
    ],
    [
      'a standard schema not built by Effect',
      'useForm({ resolver: standardSchemaResolver(schema) })',
    ],
    [
      'a resolver that submits the raw input',
      'useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema), undefined, { raw: true }) })',
    ],
    ['the Effect 3 resolver', 'useForm({ resolver: effectTsResolver(schema) })'],
  ])('blocks a form with %s (policy/form-uses-effect-schema)', async (_label, call) => {
    const result = await lintPolicy(
      `
import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
declare const schema: never;
declare const options: never;
export function useNameForm() {
  return [${call}, zodResolver, effectTsResolver, standardSchemaResolver, Schema];
}
`,
      'apps/web/src/routes/greeting/useNameForm.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/form-uses-effect-schema']);
  });

  it('passes a form whose resolver takes Schema.toStandardSchemaV1', async () => {
    const result = await lintPolicy(
      `
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
import { greetingFormSchema } from './greetingFormSchema';
export function useGreetingForm() {
  return useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(greetingFormSchema)),
    defaultValues: { name: '' },
  });
}
`,
      'apps/web/src/routes/greeting/useGreetingForm.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it('passes a form whose resolver takes toStandardSchemaV1 from effect/Schema', async () => {
    const result = await lintPolicy(
      `
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toStandardSchemaV1 } from 'effect/Schema';
import { useForm } from 'react-hook-form';
import { greetingFormSchema } from './greetingFormSchema';
export function useGreetingForm() {
  return useForm({
    resolver: standardSchemaResolver(toStandardSchemaV1(greetingFormSchema)),
    defaultValues: { name: '' },
  });
}
`,
      'apps/web/src/routes/greeting/useGreetingForm.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    ['useQuery', '@tanstack/react-query', 'useQuery(options);'],
    ['useSuspenseQuery', '@tanstack/react-query', 'useSuspenseQuery(options);'],
    ['useInfiniteQuery', '@tanstack/react-query', 'useInfiniteQuery(options);'],
    ['useQueries', '@tanstack/react-query', 'useQueries(options);'],
    ['useSuspenseQueries', '@tanstack/react-query', 'useSuspenseQueries(options);'],
    ['useSuspenseInfiniteQuery', '@tanstack/react-query', 'useSuspenseInfiniteQuery(options);'],
    ['useMutation', '@tanstack/react-query', 'useMutation(options);'],
    ['useMutationState', '@tanstack/react-query', 'useMutationState(options);'],
    ['useTransition', 'react', 'useTransition();'],
    ['useForm', 'react-hook-form', 'useForm(options);'],
    ['useFieldArray', 'react-hook-form', 'useFieldArray(options);'],
    ['useController', 'react-hook-form', 'useController(options);'],
    ['useWatch', 'react-hook-form', 'useWatch(options);'],
    ['useFormState', 'react-hook-form', 'useFormState(options);'],
  ])('blocks %s called directly in a component (policy/state-and-effects-in-hooks)', async (hook, source, call) => {
    const result = await lintPolicy(
      `
import { ${hook} } from '${source}';
declare const options: never;
export function GreetingPage() {
  ${call}
  return <p>greeting</p>;
}
`,
      'apps/web/src/routes/greeting/GreetingPage.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/state-and-effects-in-hooks');
  });

  it('passes server state inside a named custom hook', async () => {
    const result = await lintPolicy(
      `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useGreeting() {
  return useQuery(options);
}
`,
      'apps/web/src/routes/greeting/useGreeting.ts',
    );
    expect(result.ruleIds).toEqual([]);
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

describe('anti-slop policies', () => {
  jest.setTimeout(60_000);

  it.each([
    'apps/web/src/features/policy/fixture.ts',
    'apps/api/src/features/policy/domain.ts',
    'packages/ui/src/fixture.ts',
    'showcase/x/web/src/features/policy/fixture.ts',
    'showcase/x/api/src/features/policy/domain.ts',
  ])('enforces comment and depth ceilings in %s', async (filename) => {
    const source =
      '// one\n// two\n// three\n// four\n// five\n' +
      'if (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }';
    const result = await lintPolicy(source, filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/no-large-comments', 'max-depth']);
  });

  it.each([
    '/* one\n two\n three\n four\n five */',
    '/**\n * one\n * two\n * three\n */',
    '// one\n/* two */\n// three\n/* four */\n// five',
    '/* one */\n/* two */\n/* three */\n/* four */\n/* five */',
    'work(); // one\n// two\n// three\n// four\n// five',
  ])('blocks long comments including split syntaxes: %s', async (source) => {
    const result = await lintPolicy(source);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/no-large-comments']);
    expect(result.messages[0].message).toContain('4 lines or fewer');
  });

  it('keeps the comment policy active under a named inline disable', async () => {
    const directive = 'eslint';
    const result = await lintPolicy(
      `/* ${directive}-disable policy/no-large-comments */\n\n// one\n// two\n// three\n// four\n// five`,
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/no-large-comments');
    expect(result.messages.some(({ message }) => message.includes('noInlineConfig'))).toBe(true);
  });

  it('passes the boundaries and comments separated by code or a blank line', async () => {
    const result = await lintPolicy(`
// one
// two
// three
// four
if (a) { if (b) { if (c) { if (d) { work(); } } } }
/* one
 two
 three
 four */

// a separate comment
work(); // another
work(); // separate again
`);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    '<button />',
    '<input />',
    '<input type="text" />',
    '<input type="checkbox" {...props} />',
    'React.createElement("input", { type: "checkbox", [key]: "text" })',
    'make("button", {})',
    'React.createElement("input", { type: "text" })',
    'React.createElement("input", { type: "checkbox", ...props })',
  ])('requires shared primitives for %s', async (control) => {
    const result = await lintPolicy(`
import React, { createElement as make } from 'react';
const control = ${control};
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/use-ui-primitives');
  });

  it.each([
    'apps/web/src/features/policy/Fixture.tsx',
    'showcase/x/web/src/routes/policy/Fixture.tsx',
  ])('allows shared components and controls without a primitive in %s', async (filename) => {
    const result = await lintPolicy(
      `
import { Button, TextField } from '@repo/ui';
const controls = [<Button />, <TextField label="Name" />, <input type="checkbox" aria-label="Done" />, <input type={'radio'} aria-label="Choice" />];
`,
      filename,
    );
    expect(result.exitCode).toBe(0);
  });

  it.each([
    'packages/ui/src/Button.tsx',
    'apps/web/src/App.test.tsx',
  ])('allows native controls in primitive definitions and test harnesses: %s', async (filename) => {
    expect(
      (await lintPolicy('const control = <button aria-label="Save" />;', filename)).exitCode,
    ).toBe(0);
  });
});
