/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, matchesGlob, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import policy from '../tooling/eslint-plugin-policy.js';

const ROOT = resolve(__dirname, '..');
const command = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['lint:policy'];
const oxlintCommand = command.split(' && ')[0];
interface Diagnostic {
  code: string;
  severity: string;
  message: string;
  filename: string;
}
interface Fixture {
  path: string;
  caseRoot?: string;
  source: string;
  code?: string;
  codes?: string[];
  message?: string;
  messageContains?: string;
}
const policyPaths = [
  'apps/web/src/App.tsx',
  'apps/api/src/router.ts',
  'packages/ui/src/Button.tsx',
  'showcase/todo-01/web/src/App.tsx',
  'showcase/todo-01/api/src/features/todo/procedures.ts',
];
const roots = [
  'apps/web',
  'apps/api',
  'packages/ui',
  'showcase/todo-01/web',
  'showcase/todo-01/api',
];
const longComment = '// one\n// two\n// three\n// four\n// five';
const policyFixtures: Fixture[] = [
  ...policyPaths.map((path) => {
    const component = path.endsWith('.tsx');
    const api = path.includes('/api/');
    return {
      path,
      source: `${longComment}
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import value from '../../../../../../outside';
useState(0);
function useBrokenForm() { return useForm(); }
${api ? 'procedure.input(schema);' : ''}
${
  component
    ? `export function Wrong({ save }: { save: () => void }) {
  function saveValue() { return save(); }
  return <button />;
}
function ExtraPage() { return <p />; }`
    : 'export function useWrong() {}'
}
`,
      codes: [
        'policy(no-large-comments)',
        'policy(state-and-effects-in-hooks)',
        'policy(form-uses-effect-schema)',
        'policy(slice-isolation)',
        ...(api ? ['policy(procedure-input-schema)'] : []),
        ...(component
          ? [
              'policy(one-component-per-file)',
              'policy(handler-names)',
              'policy(callback-prop-names)',
              'policy(pages-in-routes)',
              'policy(file-matches-export)',
              ...(path.includes('packages/ui') ? [] : ['policy(use-ui-primitives)']),
            ]
          : ['policy(file-matches-export)']),
      ],
    };
  }),
  ...roots.flatMap((root) => [
    {
      path: `${root}/src/BadFolder/value.ts`,
      source: 'export const value = 1;',
      code: 'policy(folder-names)',
    },
    {
      path: `${root}/src/utils/value.ts`,
      source: 'export const value = 1;',
      code: 'policy(role-named-folders)',
    },
    {
      path: `${root}/src/missing.test.ts`,
      source: 'export const value = 1;',
      code: 'policy(test-beside-subject)',
    },
    {
      path: `${root}/src/export.ts`,
      source: 'export function useWrong() {}',
      code: 'policy(file-matches-export)',
    },
    {
      path: `${root}/src/ceilings.ts`,
      source: `${longComment}\nif (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`,
      codes: ['policy(no-large-comments)', 'eslint(max-depth)'],
    },
  ]),
  ...[
    '/* one\n two\n three\n four\n five */',
    '/**\n * one\n * two\n * three\n */',
    '// one\n/* two */\n// three\n/* four */\n// five',
    '/* one */\n/* two */\n/* three */\n/* four */\n/* five */',
    'work(); // one\n// two\n// three\n// four\n// five',
  ].map((source, index) => ({
    path: `apps/web/src/comment${index}.ts`,
    source,
    code: 'policy(no-large-comments)',
    messageContains: '4 lines or fewer',
  })),
  {
    path: 'apps/web/src/separated.ts',
    source:
      '// one\n// two\n// three\n// four\nwork();\n/* one\n two\n three\n four */\n\n// separate\nwork(); // another\nwork(); // separate again',
  },
  {
    path: 'apps/web/src/disabled.ts',
    source: `/* ${'eslint'}-disable policy/no-large-comments */\n\n${longComment}`,
    code: 'policy(no-large-comments)',
  },
  {
    path: 'apps/web/src/Fixture.tsx',
    source: `export function Fixture() { return <Badge />; }\n// ${'eslint'}-disable-next-line policy/one-component-per-file -- a stated reason\nfunction Badge() { return <span />; }`,
    code: 'policy(one-component-per-file)',
  },
  ...['apps/web', 'showcase/todo-01/web'].flatMap((root) => [
    ...[
      '<button />',
      '<input />',
      '<input type="text" />',
      '<input type="checkbox" {...props} />',
      'React.createElement("input", { type: "checkbox", [key]: "text" })',
      'make("button", {})',
      'React.createElement("input", { type: "text" })',
      'React.createElement("input", { type: "checkbox", ...props })',
    ].map((control, index) => ({
      path: `${root}/src/control${index}.tsx`,
      source: `import React, { createElement as make } from 'react'; const control = ${control};`,
      code: 'policy(use-ui-primitives)',
    })),
    {
      path: `${root}/src/allowed.tsx`,
      source: `import { Button, TextField } from '@repo/ui';
const controls = [<Button />, <TextField label="Name" />, <input type="checkbox" aria-label="Done" />, <input type={'radio'} aria-label="Choice" />];`,
    },
  ]),
  { path: 'packages/ui/src/native.tsx', source: 'const control = <button aria-label="Save" />;' },
  { path: 'apps/web/src/App.test.tsx', source: 'const control = <button aria-label="Save" />;' },
];
const contractFixtures: Fixture[] = [
  ...[
    ['an alias', "export { useQuery as useQ } from '@tanstack/react-query';"],
    ['everything', "export * from 'react-hook-form';"],
  ].map(([_label, source]) => ({
    path: 'apps/web/src/routes/greeting/hooks.ts',
    source: source,
    code: 'policy(state-and-effects-in-hooks)',
  })),
  ...[
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
  ].map(([_label, filename, source]) => ({
    path: filename,
    source: `${source}\nexport const value = 1;\n`,
    code: 'policy(slice-isolation)',
  })),
  ...[
    ['apps/web/src/features/loose.ts'],
    ['apps/web/src/routes/loose.ts'],
    ['apps/api/src/features/loose.ts'],
    ['showcase/todo-01/web/src/features/loose.ts'],
  ].map(([filename]) => ({
    path: filename,
    source: "import { a } from './a';\nimport { b } from './b';\nexport const loose = [a, b];\n",
    code: 'policy(slice-isolation)',
    messageContains: 'into a folder of its own',
  })),
  {
    path: 'apps/web/src/routes/greeting/value.ts',
    source: [
      "import { Button } from '@repo/ui';",
      "import { useTrpc } from '../../api-client';",
      "import { nameInput } from '../../features/name-input';",
      "import { greetingFormSchema } from './greetingFormSchema';",
      'export const value = [Button, useTrpc, nameInput, greetingFormSchema];',
    ].join('\n'),
  },
  ...[
    ['a cast instead of a schema', '.input((value) => value as { name: string })'],
    ['a bare Effect schema', '.input(greetInputSchema)'],
    ['another standard schema', '.input(z.object({ name: z.string() }))'],
    ['a cast through a computed member', "['input']((value) => value as { name: string })"],
    ['the Effect 3 adapter', '.input(Schema.standardSchemaV1(greetInputSchema))'],
  ].map(([_label, input]) => ({
    path: 'apps/api/src/features/greeting/procedures.ts',
    source: `
import { Schema } from 'effect';
import { z } from 'zod';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure${input}.query(({ input }) => input);
export const unused = [z, greetInputSchema];
`,
    code: 'policy(procedure-input-schema)',
  })),
  {
    path: 'apps/api/src/features/greeting/procedures.ts',
    source: `
import * as Schema from 'effect/Schema';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.toStandardSchemaV1(greetInputSchema)).query(({ input }) => input);
`,
  },
  {
    path: 'apps/api/src/features/greeting/procedures.ts',
    source: `
import { Schema } from 'effect';
import { procedure } from '../../trpc.ts';
const greetInputSchema = Schema.Struct({ name: Schema.String });
export const greet = procedure.input(Schema.toStandardSchemaV1(greetInputSchema)).query(({ input }) => input);
`,
  },
  ...[
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
  ].map(([_label, call]) => ({
    path: 'apps/web/src/routes/greeting/useNameForm.ts',
    source: `
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
    code: 'policy(form-uses-effect-schema)',
  })),
  {
    path: 'apps/web/src/routes/greeting/useGreetingForm.ts',
    source: `
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
  },
  {
    path: 'apps/web/src/routes/greeting/useGreetingForm.ts',
    source: `
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
  },
  ...[
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
  ].map(([hook, source, call]) => ({
    path: 'apps/web/src/routes/greeting/GreetingPage.tsx',
    source: `
import { ${hook} } from '${source}';
declare const options: never;
export function GreetingPage() {
  ${call}
  return <p>greeting</p>;
}
`,
    codes: [
      'policy(state-and-effects-in-hooks)',
      ...(hook === 'useForm' ? ['policy(form-uses-effect-schema)'] : []),
    ],
  })),
  {
    path: 'apps/web/src/routes/greeting/useGreeting.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useGreeting() {
  return useQuery(options);
}
`,
  },
].map((fixture, index) => ({ ...fixture, caseRoot: `contract-${index}` }));
const mutation = 'function f(item) { item.x = 1; }';
const loops = [
  [
    'ForStatement',
    'for (;;) {}',
    'Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
  ],
  [
    'ForInStatement',
    'for (const key in value) {}',
    'Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
  ],
  [
    'ForOfStatement',
    'for (const value of values) {}',
    'Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
  ],
  [
    'WhileStatement',
    'while (value) {}',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
  ],
  [
    'DoWhileStatement',
    'do {} while (value);',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
  ],
];
const fixtures: Fixture[] = [
  ...policyFixtures,
  ...contractFixtures,
  ...'ts tsx mts cts js jsx mjs cjs'.split(' ').flatMap((extension) => [
    { path: `scripts/mutation.${extension}`, source: mutation, code: 'eslint(no-param-reassign)' },
    { path: `scripts/copy.${extension}`, source: 'function f(item) { return { ...item, x: 1 }; }' },
  ]),
  ...loops.map(([name, source, message]) => ({
    path: `scripts/${name}.js`,
    source: source ?? '',
    code: 'policy(no-loops)',
    message: `[${name}] ${message}`,
  })),
  {
    path: 'scripts/await.js',
    source: 'async function f(values) { for await (const value of values) {} }',
  },
  ...['apps/web', 'apps/api', 'packages/ui', 'showcase/x/web', 'showcase/x/api'].flatMap((root) => [
    {
      path: `${root}/src/deep.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { if(e) { f(); } } } } } }',
      code: 'eslint(max-depth)',
    },
    {
      path: `${root}/src/shallow.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { f(); } } } } }',
    },
    ...[
      'features/greeting/domain',
      'routes/greeting/Page',
      'shared/name/value',
      'api-client/internal',
    ].map((specifier, index) => ({
      path: `${root}/src/import${index}.ts`,
      source: `import value from './${specifier}';`,
      code: 'eslint(no-restricted-imports)',
    })),
  ]),
  {
    path: 'apps/api/src/public.ts',
    source: "import { greetingRouter } from './features/greeting/index.ts';",
  },
  ...['scripts', 'tooling'].flatMap((root) => [
    {
      path: `${root}/literal.mjs`,
      source: "const value = '**';",
      code: 'policy(no-hand-written-globs)',
    },
    {
      path: `${root}/template.ts`,
      source: 'const value = `**/`;',
      code: 'policy(no-hand-written-globs)',
    },
  ]),
  { path: 'scripts/x.test.ts', source: "const value = '**'; const other = `**/`;" },
  { path: 'scripts/x.spec.ts', source: "const value = '**';" },
  { path: 'scripts/y.mjs', source: 'const value = `**$' + '{text}**`;' },
  { path: 'scripts/unused.ts', source: 'const unused = 1;' },
  { path: 'apps/web/dist/assets/index.js', source: 'while (true) {}' },
  { path: '.cache/types/apps/web/src/App.d.ts', source: 'while (true) {}' },
  {
    path: 'scripts/disable.js',
    source: `// eslint-disable-next-line no-param-reassign\n${mutation}`,
    code: 'eslint(no-param-reassign)',
  },
  { path: 'apps/web/src/nested.ts', source: mutation, code: 'eslint(no-param-reassign)' },
];
let directory: string;
let diagnostics: Diagnostic[];
let elapsed: number;
function write(path: string, source: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), source);
}
function run(cwd: string, extra: string[] = []) {
  const [executable, ...args] = oxlintCommand.split(' ');
  return spawnSync(executable, [...args, '--format', 'json', ...extra], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
  });
}
function fixturePath({ path, caseRoot = '' }: Fixture) {
  return join(caseRoot, path);
}
function lintTree(cases: Fixture[]) {
  if (new Set(cases.map(fixturePath)).size !== cases.length)
    throw new Error('Duplicate fixture path');
  cases.forEach((fixture) => {
    write(fixturePath(fixture), fixture.source);
  });
  write(
    'oxlint.config.ts',
    `import config from ${JSON.stringify(pathToFileURL(join(ROOT, 'oxlint.config.ts')).href)};
export default { ...config, overrides: config.overrides.map(override => ({
  ...override, files: override.files.flatMap(pattern => [pattern, "contract-*/" + pattern])
})) };`,
  );
  write('apps/web/.oxlintrc.json', '{"rules":{"no-param-reassign":"off"}}');
  const started = performance.now();
  const result = run(directory);
  elapsed = performance.now() - started;
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  return JSON.parse(result.stdout).diagnostics;
}
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'oxlint-policy-'));
  diagnostics = lintTree(fixtures);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it.each(fixtures)('$# $path has the expected policy diagnostics', ({
  path,
  caseRoot,
  code,
  codes,
  message,
  messageContains,
}) => {
  const found = diagnostics.filter(
    ({ filename }) =>
      filename.replaceAll('\\', '/').replace(`${directory}/`, '') ===
      fixturePath({ path, caseRoot, source: '' }),
  );
  expect(found.map(({ code: actual, severity }) => [actual, severity]).sort()).toEqual(
    (codes ?? (code ? [code] : [])).map((rule) => [rule, 'error']).sort(),
  );
  if (message) expect(found[0]?.message).toBe(message);
  if (messageContains) expect(found[0]?.message).toContain(messageContains);
});
it('turns on every policy rule at error in result roots', () => {
  const rules = Object.keys(policy.rules).filter(
    (rule) => !['no-loops', 'no-hand-written-globs'].includes(rule),
  );
  expect(rules).toHaveLength(14);
  roots.forEach((root) => {
    const applicable = rules.filter(
      (rule) =>
        (![
          'one-component-per-file',
          'handler-names',
          'callback-prop-names',
          'pages-in-routes',
        ].includes(rule) ||
          !root.endsWith('/api')) &&
        (rule !== 'use-ui-primitives' || (!root.endsWith('/api') && root !== 'packages/ui')) &&
        (rule !== 'procedure-input-schema' || root.endsWith('/api')),
    );
    applicable.forEach((rule) => {
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringContaining(`${root}/src/`),
            code: `policy(${rule})`,
            severity: 'error',
          }),
        ]),
      );
    });
  });
});
it('runs the fixture set in under ten seconds', () => expect(elapsed).toBeLessThan(10_000));
it('rejects duplicate fixture paths', () =>
  expect(() =>
    lintTree([
      { path: 'x.js', source: '' },
      { path: 'x.js', source: '' },
    ]),
  ).toThrow('Duplicate fixture path'));
it('lint:policy runs Oxlint before ESLint', () => {
  expect(command).toBe(
    'env -u NAPI_RS_NATIVE_LIBRARY_PATH -u VP_VERSION -u OXLINT_TSGOLINT_PATH oxlint --no-ignore --config oxlint.config.ts --deny-warnings && eslint --max-warnings=0 .',
  );
});
it('the repository passes the Oxlint policy and covers every tracked source file', () => {
  const result = run(ROOT);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.diagnostics).toEqual([]);
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.split('\0');
  const ignored = [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ];
  const sources = tracked.filter(
    (path) =>
      new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']).has(extname(path)) &&
      !ignored.some((pattern) => matchesGlob(path, pattern)),
  );
  expect(report.number_of_files).toBe(sources.length);
});
