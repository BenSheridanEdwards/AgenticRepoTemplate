/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import policy from '../tooling/eslint-plugin-policy.js';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ESLINT_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/eslint');

interface LintResult {
  exitCode: number | null;
  ruleIds: string[];
  output: string;
}

/** Lints `source` through the real ESLint CLI as if it lived at `filename`. */
function lintPolicy(
  source: string,
  filename = 'apps/web/src/features/policy/Fixture.tsx',
): LintResult {
  const run = spawnSync(
    ESLINT_BIN,
    ['--max-warnings=0', '--format=json', '--stdin', '--stdin-filename', filename],
    { cwd: REPOSITORY_ROOT, input: source, encoding: 'utf8' },
  );
  const output = `${run.stdout}${run.stderr}`;
  let ruleIds: string[] = [];
  try {
    const [report] = JSON.parse(run.stdout) as [{ messages: { ruleId: string | null }[] }];
    ruleIds = report.messages.map((message) => message.ruleId ?? 'parse-error');
  } catch {
    ruleIds = [];
  }
  return { exitCode: run.status, ruleIds, output };
}

describe('ESLint policy stack', () => {
  jest.setTimeout(60_000);

  it('turns on every local policy rule as an error for apps/web/src/', () => {
    const run = spawnSync(ESLINT_BIN, ['--print-config', 'apps/web/src/App.tsx'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    const { rules } = JSON.parse(run.stdout) as { rules: Record<string, unknown[]> };
    for (const rule of Object.keys(policy.rules)) {
      expect([`policy/${rule}`, rules[`policy/${rule}`]?.[0]]).toEqual([`policy/${rule}`, 2]);
    }
  });

  it('ignores build output inside a workspace package', () => {
    const run = spawnSync(ESLINT_BIN, ['--print-config', 'apps/web/dist/assets/index.js'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(run.stdout.trim()).toBe('undefined');
  });

  it('blocks a hook called inside a condition (react-hooks/rules-of-hooks)', () => {
    const result = lintPolicy(`
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

  it('blocks impure work during render (React Compiler react-hooks/purity)', () => {
    const result = lintPolicy(`
export function Lottery() {
  const ticket = Math.random();
  return <p>{ticket}</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('react-hooks/purity');
  });

  it('blocks a React Doctor finding (react-doctor/no-fetch-in-effect)', () => {
    const result = lintPolicy(`
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

  it('passes a clean component', () => {
    const result = lintPolicy(`
export function Fixture({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('leaves general lint such as unused variables to Biome', () => {
    const result = lintPolicy(`
export function Fixture() {
  const unused = 1;
  return <p>Hello</p>;
}
`);
    expect(result.ruleIds).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('blocks a second component in one file (policy/one-component-per-file)', () => {
    const result = lintPolicy(`
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
  ])('blocks %s called directly in a component (policy/state-and-effects-in-hooks)', (_label, importLine, call) => {
    const result = lintPolicy(`
${importLine}
export function Fixture() {
  ${call}
  return <p>state</p>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/state-and-effects-in-hooks');
  });

  it('passes state and effects inside a named custom hook', () => {
    const result = lintPolicy(
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

  it('blocks state mirrored from a prop by an effect (react-hooks/set-state-in-effect)', () => {
    const result = lintPolicy(
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

  it('blocks a function inside a component without the handle prefix (policy/handler-names)', () => {
    const result = lintPolicy(`
export function Fixture({ onSave }: { onSave: () => void }) {
  const save = () => onSave();
  return <button type="button" onClick={save}>Save</button>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/handler-names');
  });

  it('passes handle-prefixed functions and on-prefixed callback props', () => {
    const result = lintPolicy(`
interface FixtureProps {
  label: string;
  onSave: () => void;
}
export function Fixture({ label, onSave }: FixtureProps) {
  const handleClick = () => onSave();
  return <button type="button" onClick={handleClick}>{label}</button>;
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
  ])('blocks a callback prop without the on prefix in %s (policy/callback-prop-names)', (_label, header) => {
    const result = lintPolicy(`
${header}
  return <button type="button" onClick={save}>Save</button>;
}
`);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/callback-prop-names');
  });

  it('blocks a page component outside apps/web/src/routes (policy/pages-in-routes)', () => {
    const result = lintPolicy(
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

  it('blocks a page component under a src/routes folder nested inside a feature', () => {
    const result = lintPolicy(
      'export function SettingsPage() {\n  return <main>settings</main>;\n}',
      'apps/web/src/features/settings/src/routes/SettingsPage.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/pages-in-routes');
  });

  it('passes a page component under apps/web/src/routes', () => {
    const result = lintPolicy(
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
  ])('blocks %s in a file of another name (policy/file-matches-export)', (_label, filename, source) => {
    const result = lintPolicy(source, filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/file-matches-export');
  });

  it('blocks a folder that is not kebab-case (policy/folder-names)', () => {
    const result = lintPolicy(
      'export function Fixture() {\n  return <p />;\n}',
      'apps/web/src/features/ThresholdCounter/Fixture.tsx',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('policy/folder-names');
  });

  it('blocks a class component (react-doctor/prefer-function-component)', () => {
    const result = lintPolicy(`
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

  it('blocks a deep import past a public surface (no-restricted-imports)', () => {
    const result = lintPolicy(
      "export { useServiceStatus } from '../features/service-status/useServiceStatus';",
      'apps/web/src/routes/home/index.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toContain('no-restricted-imports');
  });

  it('names the helper, not the exported component, when a helper comes first', () => {
    const result = lintPolicy(`
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

  it('leaves a test harness component alone', () => {
    const result = lintPolicy(
      `
import { useState } from 'react';
export function Harness() {
  const [value, setValue] = useState(0);
  const bump = () => setValue(value + 1);
  return <button type="button" onClick={bump}>{value}</button>;
}
`,
      'apps/web/src/features/policy/Fixture.test.tsx',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it.each([
    [
      'useActionState',
      "import { useActionState } from 'react';",
      'useActionState(async (x: number) => x, 0);',
    ],
  ])('blocks %s in a component (policy/state-and-effects-in-hooks)', (_label, importLine, call) => {
    const result = lintPolicy(`
${importLine}
export function Fixture() {
  ${call}
  return <p>state</p>;
}
`);
    expect(result.ruleIds).toContain('policy/state-and-effects-in-hooks');
  });

  it('blocks a React.useCallback without the handle prefix (policy/handler-names)', () => {
    const result = lintPolicy(`
import * as React from 'react';
export function Fixture({ onSave }: { onSave: () => void }) {
  const save = React.useCallback(() => onSave(), [onSave]);
  return <button type="button" onClick={save}>Save</button>;
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
  ])('blocks a callback prop without the on prefix through %s (policy/callback-prop-names)', (_label, header) => {
    const result = lintPolicy(`
${header}
  return <button type="button" onClick={save}>Save</button>;
};
`);
    expect(result.ruleIds).toContain('policy/callback-prop-names');
  });

  it('passes render props and children', () => {
    const result = lintPolicy(`
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

  it('passes a __tests__ folder (policy/folder-names)', () => {
    const result = lintPolicy(
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
  ])('turns on every local policy rule as an error for %s', (path) => {
    const run = spawnSync(ESLINT_BIN, ['--print-config', path], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    const { rules } = JSON.parse(run.stdout) as { rules: Record<string, unknown[]> };
    for (const rule of Object.keys(policy.rules)) {
      expect([`policy/${rule}`, rules[`policy/${rule}`]?.[0]]).toEqual([`policy/${rule}`, 2]);
    }
  });

  it('passes a router that imports a feature through its index.ts with an explicit extension', () => {
    const result = lintPolicy(
      "export { greetingRouter } from './features/greeting/index.ts';",
      'apps/api/src/router.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it('blocks a router that reaches past a feature index.ts (no-restricted-imports)', () => {
    const result = lintPolicy(
      "export { formatGreeting } from './features/greeting/domain.ts';",
      'apps/api/src/router.ts',
    );
    expect(result.ruleIds).toEqual(['no-restricted-imports']);
  });

  it('blocks a route that reaches past the api client index.ts (no-restricted-imports)', () => {
    const result = lintPolicy(
      "export { createQueryClient } from '../../api-client/trpc';",
      'apps/web/src/routes/greeting/index.ts',
    );
    expect(result.ruleIds).toEqual(['no-restricted-imports']);
  });

  it.each([
    ['an alias', "export { useQuery as useQ } from '@tanstack/react-query';"],
    ['everything', "export * from 'react-hook-form';"],
  ])('blocks re-exporting a state hook module as %s (policy/state-and-effects-in-hooks)', (_label, source) => {
    const result = lintPolicy(source, 'apps/web/src/routes/greeting/hooks.ts');
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
  ])('blocks %s (policy/slice-isolation)', (_label, filename, source) => {
    const result = lintPolicy(`${source}\nexport const value = 1;\n`, filename);
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/slice-isolation']);
  });

  it.each([
    ['apps/web/src/features/loose.ts'],
    ['apps/web/src/routes/loose.ts'],
    ['apps/api/src/features/loose.ts'],
    ['showcase/todo-01/web/src/features/loose.ts'],
  ])('blocks the loose file %s directly under a slice folder (policy/slice-isolation)', (filename) => {
    const result = lintPolicy(
      "import { a } from './a';\nimport { b } from './b';\nexport const loose = [a, b];\n",
      filename,
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/slice-isolation']);
    expect(result.output).toContain('into a folder of its own');
  });

  it('passes a route that imports its own files, a feature, the api client and the ui kit', () => {
    const result = lintPolicy(
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
  ])('blocks a procedure input given %s (policy/procedure-input-schema)', (_label, input) => {
    const result = lintPolicy(
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

  it('passes a procedure input wrapped in standardSchemaV1 from effect/Schema', () => {
    const result = lintPolicy(
      `
import * as Schema from 'effect/Schema';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.standardSchemaV1(greetInputSchema)).query(({ input }) => input);
`,
      'apps/api/src/features/greeting/procedures.ts',
    );
    expect(result.ruleIds).toEqual([]);
  });

  it('passes a procedure input wrapped in Schema.standardSchemaV1', () => {
    const result = lintPolicy(
      `
import { Schema } from 'effect';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.standardSchemaV1(greetInputSchema)).query(({ input }) => input);
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
    ['a spread after the resolver', 'useForm({ resolver: effectTsResolver(schema), ...options })'],
  ])('blocks a form with %s (policy/form-uses-effect-schema)', (_label, call) => {
    const result = lintPolicy(
      `
import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
declare const schema: never;
declare const options: never;
export function useNameForm() {
  return [${call}, zodResolver, effectTsResolver];
}
`,
      'apps/web/src/routes/greeting/useNameForm.ts',
    );
    expect(result.exitCode).toBe(1);
    expect(result.ruleIds).toEqual(['policy/form-uses-effect-schema']);
  });

  it('passes a form whose resolver is effectTsResolver', () => {
    const result = lintPolicy(
      `
import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { useForm } from 'react-hook-form';
import { greetingFormSchema } from './greetingFormSchema';
export function useGreetingForm() {
  return useForm({ resolver: effectTsResolver(greetingFormSchema), defaultValues: { name: '' } });
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
  ])('blocks %s called directly in a component (policy/state-and-effects-in-hooks)', (hook, source, call) => {
    const result = lintPolicy(
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

  it('passes server state inside a named custom hook', () => {
    const result = lintPolicy(
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
