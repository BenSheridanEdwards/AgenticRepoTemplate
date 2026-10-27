/**
 * @jest-environment node
 */
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { validateStructure } from './structure.mjs';
import { createMonorepo, loadRepositoryContract, resultFiles, runTool } from './temporary-monorepo';

const contract = loadRepositoryContract();

const resultAt = (id: string, root: string, scope: string) => ({
  id,
  root,
  scope,
  web: `${root}/web`,
  api: `${root}/api`,
  ports: { web: 0, api: 0 },
});
const reference = resultAt('reference', 'apps', 'repo');
// Generic greeting fixture; canonical brief identities are exercised separately below.
const todo = resultAt('example', 'showcase/todo-01', 'todo-01');

const CLEAN_TREE: Record<string, string> = {
  ...resultFiles('apps', 'repo'),
  ...resultFiles('showcase/todo-01', 'todo-01'),
  'apps/architecture.mmd': 'flowchart LR\n',
  'showcase/todo-01/architecture.mmd': 'flowchart LR\n',
  'packages/ui/src/index.ts': 'export const Button = 1;\n',
  'scripts/tool.mjs': '// eslint-disable-next-line no-console -- outside every result\n',
};

/** Validates `tree` (path to text, `null` deletes) with the given extra edges. */
function validate(
  changes: Record<string, string | null> = {},
  {
    edges = [] as { from: string; to: string }[],
    results = [reference, todo],
    symlinks = [] as string[],
    contract: structureContract = contract,
  } = {},
) {
  const tree = Object.fromEntries(
    Object.entries({ ...CLEAN_TREE, ...changes }).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  const files = Object.keys(tree);
  const manifests = new Map(
    files
      .filter((file) => file.endsWith('/package.json'))
      .map((file) => [file.slice(0, -'/package.json'.length), JSON.parse(tree[file] ?? '')]),
  );
  return validateStructure({
    contract: structureContract,
    results,
    files,
    edges: [
      ...results.map((result) => ({
        from: `${result.api}/src/features/greeting/application.ts`,
        to: `${result.api}/src/features/greeting/domain.ts`,
      })),
      ...edges,
    ],
    symlinks,
    manifests,
    readText: (path: string) => tree[path] ?? '',
  });
}

const editManifest = (path: string, edit: (fields: Record<string, unknown>) => void) => {
  const fields = JSON.parse(CLEAN_TREE[path] ?? '{}');
  edit(fields);
  return { [path]: JSON.stringify(fields) };
};

const FEATURE = 'showcase/todo-01/api/src/features/greeting';
const APPLICATION = `${FEATURE}/application.ts`;
const DOMAIN = `${FEATURE}/domain.ts`;
const DOMAIN_RULE_VIOLATION = { kind: 'application-without-domain-rule', feature: FEATURE };
const CLIENT_REPORT = 'web/etc/api-client.api.md';
const CLIENT_EXPORTS = [
  'export declare function ApiProvider(): void;',
  'export type RouterInputs = unknown;',
  'export type RouterOutputs = unknown;',
  'export interface TestApiHandlers {}',
  'export declare function TestApiProvider(): void;',
  'export declare const useTrpc: unknown;',
];

function clientReports(actual: string[]) {
  return {
    [`apps/${CLIENT_REPORT}`]: CLIENT_EXPORTS.join('\n'),
    [`showcase/todo-01/${CLIENT_REPORT}`]: actual.join('\n'),
  };
}

describe('validateStructure', () => {
  it('passes the clean reference and a clean showcase result', () => {
    expect(validate()).toEqual([]);
  });

  it('fails a package that lacks a required role', () => {
    expect(
      validate({
        'apps/api/src/trpc.ts': null,
        'showcase/todo-01/web/src/routes/greeting/index.ts': null,
      }),
    ).toEqual([
      { kind: 'missing-role', result: 'apps', role: 'api-trpc' },
      { kind: 'missing-role', result: 'showcase/todo-01', role: 'web-routes' },
    ]);
  });

  it('holds a role only through a source file, not a test or a note', () => {
    expect(
      validate({
        'showcase/todo-01/web/src/routes/greeting/index.ts': null,
        'showcase/todo-01/web/src/routes/greeting/GreetingPage.test.tsx': 'export {};\n',
        'showcase/todo-01/web/src/routes/greeting/notes.md': '# Notes\n',
      }),
    ).toEqual([{ kind: 'missing-role', result: 'showcase/todo-01', role: 'web-routes' }]);
  });

  it('fails a config file at any depth below a package root', () => {
    const nested = [
      'showcase/todo-01/api/etc/.npmrc',
      'showcase/todo-01/web/e2e/playwright.config.ts',
      'showcase/todo-01/web/src/biome.json',
      'showcase/todo-01/web/src/package.json',
      'showcase/todo-01/web/src/routes/greeting/tsconfig.json',
    ];
    expect(validate(Object.fromEntries(nested.map((path) => [path, '{}\n'])))).toEqual(
      nested.map((path) => ({ kind: 'unexpected-file', result: 'showcase/todo-01', path })),
    );
  });

  it('fails a symlink anywhere under a result root', () => {
    const symlinks = ['showcase/todo-01/web/src/routes/shared', 'scripts/linked'];
    expect(validate({}, { symlinks })).toEqual([
      {
        kind: 'symlink',
        result: 'showcase/todo-01',
        path: 'showcase/todo-01/web/src/routes/shared',
      },
    ]);
  });

  it('fails a file outside the allowed layout of a result root, a web package and an api package', () => {
    expect(
      validate({
        'apps/web/tsconfig.json': '{}\n',
        'showcase/todo-01/README.md': '# Todo\n',
        'showcase/todo-01/api/index.html': '<p></p>\n',
        'showcase/todo-01/web/src': 'not a folder\n',
      }),
    ).toEqual([
      { kind: 'unexpected-file', result: 'apps', path: 'apps/web/tsconfig.json' },
      { kind: 'unexpected-file', result: 'showcase/todo-01', path: 'showcase/todo-01/README.md' },
      {
        kind: 'unexpected-file',
        result: 'showcase/todo-01',
        path: 'showcase/todo-01/api/index.html',
      },
      { kind: 'unexpected-file', result: 'showcase/todo-01', path: 'showcase/todo-01/web/src' },
    ]);
  });

  it('allows public/ in a web package and etc/ in both packages', () => {
    expect(
      validate({
        'apps/web/public/favicon.svg': '<svg/>\n',
        'apps/web/etc/api-client.api.md': '# report\n',
        'showcase/todo-01/api/etc/api.api.md': '# report\n',
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'an external dependency the reference web lacks',
      (fields: Record<string, Record<string, string>>) => {
        fields.dependencies = { ...fields.dependencies, lodash: '^4.17.21' };
      },
      /lodash/,
    ],
    [
      'a range that differs from the reference',
      (fields: Record<string, Record<string, string>>) => {
        fields.dependencies = { ...fields.dependencies, react: '^18.3.0' };
      },
      /react/,
    ],
    [
      "another result's api",
      (fields: Record<string, Record<string, string>>) => {
        fields.devDependencies = { '@todo-02/api': 'workspace:*' };
      },
      /@todo-02\/api/,
    ],
    [
      'a missing @repo/ui',
      (fields: Record<string, Record<string, string>>) => {
        fields.dependencies = { react: '^19.1.0' };
      },
      /@repo\/ui/,
    ],
    [
      'a script the reference web lacks',
      (fields: Record<string, Record<string, string>>) => {
        fields.scripts = { ...fields.scripts, lint: 'eslint .' };
      },
      /lint/,
    ],
    [
      'a script command that differs from the reference',
      (fields: Record<string, Record<string, string>>) => {
        fields.scripts = { ...fields.scripts, build: 'true' };
      },
      /scripts/,
    ],
    [
      'a field the reference lacks',
      (fields: Record<string, Record<string, string>>) => {
        fields.pnpm = { overrides: { react: '18.3.1' } };
      },
      /pnpm/,
    ],
  ])('fails a showcase web manifest with %s', (_, edit, problem) => {
    expect(validate(editManifest('showcase/todo-01/web/package.json', edit as never))).toEqual([
      {
        kind: 'manifest',
        package: 'showcase/todo-01/web',
        problem: expect.stringMatching(problem),
      },
    ]);
  });

  it('fails a manifest with the wrong name, not private, or not an ES module', () => {
    const violations = validate(
      editManifest('showcase/todo-01/api/package.json', (fields) => {
        fields.name = '@repo/api';
        fields.private = false;
        fields.type = 'commonjs';
      }),
    );
    expect(violations).toEqual([
      {
        kind: 'manifest',
        package: 'showcase/todo-01/api',
        problem: expect.stringMatching(/@todo-01\/api/),
      },
      {
        kind: 'manifest',
        package: 'showcase/todo-01/api',
        problem: expect.stringMatching(/private/),
      },
      {
        kind: 'manifest',
        package: 'showcase/todo-01/api',
        problem: expect.stringMatching(/module/),
      },
    ]);
  });

  it('fails an api manifest that lists a workspace dependency', () => {
    expect(
      validate(
        editManifest('showcase/todo-01/api/package.json', (fields) => {
          fields.dependencies = { effect: '^3.22.3', '@repo/ui': 'workspace:*' };
        }),
      ),
    ).toEqual([
      {
        kind: 'manifest',
        package: 'showcase/todo-01/api',
        problem: expect.stringMatching(/@repo\/ui/),
      },
    ]);
  });

  it('fails a showcase folder that is not a complete result', () => {
    expect(
      validate(
        { 'showcase/half/web/package.json': '{}\n', 'showcase/half/web/src/main.tsx': '' },
        { results: [reference, todo] },
      ),
    ).toEqual([
      {
        kind: 'incomplete-result',
        root: 'showcase/half',
        missing: 'showcase/half/api/package.json',
      },
    ]);
  });

  it('fails a web package with no e2e spec', () => {
    expect(validate({ 'showcase/todo-01/web/e2e/greeting.spec.ts': null })).toEqual([
      { kind: 'missing-e2e', package: 'showcase/todo-01/web' },
    ]);
  });

  it('accepts a web package whose only e2e spec is in a nested folder, as Playwright runs it', () => {
    expect(
      validate({
        'showcase/todo-01/web/e2e/greeting.spec.ts': null,
        'showcase/todo-01/web/e2e/todos/add.spec.ts': '',
      }),
    ).toEqual([]);
  });

  it('fails an import from one result into another, and allows the ui kit', () => {
    const edges = [
      { from: 'showcase/todo-01/web/src/api-client/index.ts', to: 'apps/api/src/router.ts' },
      { from: 'showcase/todo-01/web/src/main.tsx', to: 'packages/ui/src/index.ts' },
      { from: 'apps/web/src/main.tsx', to: 'apps/web/src/App.tsx' },
    ];
    expect(validate({}, { edges })).toEqual([
      {
        kind: 'cross-result-import',
        from: 'showcase/todo-01/web/src/api-client/index.ts',
        to: 'apps/api/src/router.ts',
      },
    ]);
  });

  it.each([
    "import { formatGreeting, type Greeting } from './domain.ts';",
    "export { formatGreeting, type Greeting } from './domain.ts';",
    "export * from './domain.ts';",
    "import './domain.ts';",
    "const domain = import('./domain.ts');",
  ])('accepts a domain value crossing: %s', (source) => {
    expect(validate({ [APPLICATION]: source })).toEqual([]);
  });

  it.each([
    "import type { Greeting } from './domain.ts';",
    "import { type Greeting } from './domain.ts';",
    "export type { Greeting } from './domain.ts';",
    "export { type Greeting } from './domain.ts';",
    "export type * from './domain.ts';",
    "type Greeting = import('./domain.ts').Greeting;",
    'export const greet = () => "Hello";',
    "import type { Greeting } from './domain.ts'; import { remember } from './integrations.ts';",
  ])('fails an application without a domain value crossing: %s', (source) => {
    expect(validate({ [APPLICATION]: source })).toEqual([DOMAIN_RULE_VIOLATION]);
  });

  it('accepts an application folder when one file value-imports its domain folder', () => {
    const from = `${FEATURE}/application/greet.ts`;
    const to = `${FEATURE}/domain/rules.ts`;
    expect(
      validate(
        {
          [APPLICATION]: null,
          [DOMAIN]: null,
          [`${FEATURE}/application/types.ts`]:
            "import type { Greeting } from '../domain/rules.ts';",
          [from]: "import { formatGreeting } from '../domain/rules.ts';",
          [to]: 'export const formatGreeting = () => "Hello";',
        },
        { edges: [{ from, to }] },
      ),
    ).toEqual([]);
  });

  it('requires the value crossing to be resolved by Fallow', () => {
    expect(
      validate({
        [APPLICATION]: null,
        [`${FEATURE}/application/greet.ts`]: "import { formatGreeting } from '../domain.ts';",
      }),
    ).toEqual([DOMAIN_RULE_VIOLATION]);
  });

  it('leaves a missing domain to the missing-role check', () => {
    expect(validate({ [DOMAIN]: null })).toEqual([
      { kind: 'missing-role', result: 'showcase/todo-01', role: 'api-domain' },
    ]);
  });

  it.each([
    'application/greet.test.ts',
    'application/greet.d.ts',
  ])('ignores a value import in %s when checking the application role', (name) => {
    const from = `${FEATURE}/${name}`;
    expect(
      validate(
        {
          [APPLICATION]: "import type { Greeting } from './domain.ts';",
          [from]: "import { formatGreeting } from '../domain.ts';",
        },
        { edges: [{ from, to: DOMAIN }] },
      ),
    ).toEqual([DOMAIN_RULE_VIOLATION]);
  });

  it('requires the domain to belong to the same feature', () => {
    const sibling = 'showcase/todo-01/api/src/features/other/domain.ts';
    expect(
      validate(
        {
          [APPLICATION]: "import { formatGreeting } from '../other/domain.ts';",
          [sibling]: 'export const formatGreeting = () => "Hello";',
        },
        { edges: [{ from: APPLICATION, to: sibling }] },
      ),
    ).toEqual([DOMAIN_RULE_VIOLATION]);
  });

  it('requires a domain value crossing in the reference too', () => {
    expect(
      validate({
        'apps/api/src/features/greeting/application.ts':
          "import type { Greeting } from './domain.ts';",
      }),
    ).toEqual([
      { kind: 'application-without-domain-rule', feature: 'apps/api/src/features/greeting' },
    ]);
  });

  it('checks only named features when a role source is outside the feature layout', () => {
    const application = 'showcase/todo-01/api/src/application.ts';
    const domain = 'showcase/todo-01/api/src/domain.ts';
    expect(
      validate(
        {
          [application]: 'export const greet = () => "Hello";',
          [domain]: 'export const formatGreeting = () => "Hello";',
          [APPLICATION]: "import type { Greeting } from './domain.ts';",
        },
        {
          contract: {
            ...contract,
            roleOf: (file: string) => {
              if (file === application) return 'api-application';
              if (file === domain) return 'api-domain';
              return contract.roleOf(file);
            },
          },
        },
      ),
    ).toEqual([DOMAIN_RULE_VIOLATION]);
  });

  it('accepts the scaffold export names and kinds in any order', () => {
    expect(validate(clientReports([...CLIENT_EXPORTS].reverse()))).toEqual([]);
  });

  it.each([
    'export abstract class Extra {}',
    'export namespace Extra {}',
    'export declare let extra: unknown;',
    'export { extra };',
    'export {',
    'export type { Extra };',
  ])('rejects an unrecognised scaffold export: %s', (line) => {
    expect(validate(clientReports([...CLIENT_EXPORTS, line]))).toEqual([
      {
        kind: 'scaffold-exports',
        path: `showcase/todo-01/${CLIENT_REPORT}`,
        problem: `Unsupported scaffold API export: ${line}`,
      },
    ]);
  });

  it('reports unsupported reference and result lines once each and keeps checking other reports', () => {
    const lines = ['export namespace Extra {}', 'export declare let extra: unknown;'];
    expect(
      validate({
        [`apps/${CLIENT_REPORT}`]: lines.join('\n'),
        [`showcase/todo-01/${CLIENT_REPORT}`]: lines[0] ?? '',
        'apps/api/etc/api.api.md': 'export declare const appRouter: unknown;',
        'showcase/todo-01/api/etc/api.api.md': '',
      }),
    ).toEqual([
      ...lines.map((line) => ({
        kind: 'scaffold-exports',
        path: `apps/${CLIENT_REPORT}`,
        problem: `Unsupported scaffold API export: ${line}`,
      })),
      {
        kind: 'scaffold-exports',
        path: `showcase/todo-01/${CLIENT_REPORT}`,
        problem: `Unsupported scaffold API export: ${lines[0]}`,
      },
      {
        kind: 'scaffold-exports',
        path: 'showcase/todo-01/api/etc/api.api.md',
        referencePath: 'apps/api/etc/api.api.md',
        role: 'api-app',
        actual: [],
        expected: ['appRouter:value'],
      },
    ]);
  });

  it('reports unsupported reference lines when the result exports are supported', () => {
    const line = 'export namespace Extra {}';
    expect(
      validate({
        ...clientReports(CLIENT_EXPORTS),
        [`apps/${CLIENT_REPORT}`]: [...CLIENT_EXPORTS, line].join('\n'),
      }),
    ).toEqual([
      {
        kind: 'scaffold-exports',
        path: `apps/${CLIENT_REPORT}`,
        problem: `Unsupported scaffold API export: ${line}`,
      },
    ]);
  });

  it.each([
    ['a missing RouterInputs', CLIENT_EXPORTS.filter((line) => !line.includes('RouterInputs'))],
    ['an extra export', [...CLIENT_EXPORTS, 'export declare const extra: unknown;']],
    [
      'a changed kind',
      CLIENT_EXPORTS.map((line) =>
        line.includes('RouterInputs') ? 'export declare const RouterInputs: unknown;' : line,
      ),
    ],
  ])('fails the scaffold report with %s', (_, actual) => {
    expect(validate(clientReports(actual))).toEqual([
      {
        kind: 'scaffold-exports',
        path: `showcase/todo-01/${CLIENT_REPORT}`,
        referencePath: `apps/${CLIENT_REPORT}`,
        role: 'web-api-client',
        actual: expect.any(Array),
        expected: [
          'ApiProvider:value',
          'RouterInputs:type',
          'RouterOutputs:type',
          'TestApiHandlers:type',
          'TestApiProvider:value',
          'useTrpc:value',
        ],
      },
    ]);
  });

  it('treats an interface and a type alias as the same export kind', () => {
    expect(
      validate(
        clientReports(
          CLIENT_EXPORTS.map((line) =>
            line.includes('RouterInputs') ? 'export interface RouterInputs {}' : line,
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('pins the api-app report as well as the web api client', () => {
    const referencePath = 'apps/api/etc/api.api.md';
    const path = 'showcase/todo-01/api/etc/api.api.md';
    expect(
      validate({
        [referencePath]:
          'export type AppRouter = unknown;\nexport declare const appRouter: unknown;',
        [path]: 'export type AppRouter = unknown;',
      }),
    ).toEqual([
      {
        kind: 'scaffold-exports',
        path,
        referencePath,
        role: 'api-app',
        actual: ['AppRouter:type'],
        expected: ['AppRouter:type', 'appRouter:value'],
      },
    ]);
  });

  it.each([
    '/* eslint policy/one-component-per-file: off */',
    '/* eslint-env node */',
    '/* global document */',
    '/* istanbul ignore next */',
    '/* c8 ignore next */',
    '/* v8 ignore next */',
  ])('fails the inline config or coverage pragma %s', (directive) => {
    expect(
      validate({ 'showcase/todo-01/web/src/App.tsx': `${directive}\nexport const App = 1;\n` }),
    ).toEqual([{ kind: 'suppression', path: 'showcase/todo-01/web/src/App.tsx', line: 1 }]);
  });

  it.each([
    '// eslint flags nested ternaries, so this uses an early return',
    '// eslint-plugin-policy wants one component per file',
  ])('passes the prose line comment %s', (comment) => {
    expect(
      validate({ 'showcase/todo-01/web/src/App.tsx': `${comment}\nexport const App = 1;\n` }),
    ).toEqual([]);
  });

  it('fails every suppression directive under a result root, with its line', () => {
    const lines = (directive: string) => `export const a = 1;\n${directive}\nexport const b = 2;\n`;
    expect(
      validate({
        'apps/web/src/routes/greeting/index.ts': lines(
          '// eslint-disable-next-line no-console -- with a reason',
        ),
        'apps/api/src/trpc.ts': lines('// @ts-expect-error the value is checked at runtime'),
        'showcase/todo-01/web/src/App.tsx': lines(
          '// biome-ignore lint/style/useNamingConvention: reason',
        ),
        'showcase/todo-01/api/src/server.ts': lines(
          `// fallow-${'ignore'}-next-line unused-export`,
        ),
        'showcase/todo-01/web/e2e/greeting.spec.ts': lines(`// @ts-${'ignore'}`),
      }),
    ).toEqual([
      { kind: 'suppression', path: 'apps/api/src/trpc.ts', line: 2 },
      { kind: 'suppression', path: 'apps/web/src/routes/greeting/index.ts', line: 2 },
      { kind: 'suppression', path: 'showcase/todo-01/api/src/server.ts', line: 2 },
      { kind: 'suppression', path: 'showcase/todo-01/web/e2e/greeting.spec.ts', line: 2 },
      { kind: 'suppression', path: 'showcase/todo-01/web/src/App.tsx', line: 2 },
    ]);
  });
});

function canonicalRoute(brief: 'todo' | 'notes') {
  const id = `${brief}-codex-02`;
  const result = resultAt(id, `showcase/${id}`, id);
  const entity = brief === 'todo' ? 'Todo' : 'Note';
  const plural = `${entity}s`;
  const route = `${result.web}/src/routes/${plural.toLowerCase()}`;
  const callbacks = `${brief === 'todo' ? `onToggle: (id: ${entity}['id']) => void;` : ''} onDelete: (id: ${entity}['id']) => void`;
  const props = {
    [`${plural}Page`]: '',
    [`${entity}Form`]: `props: { onCreate: (input: Create${entity}) => void; pending: boolean }`,
    [`${entity}List`]: `props: { ${plural.toLowerCase()}: readonly ${entity}[]; ${callbacks} }`,
    [`${entity}Item`]: `props: { ${entity.toLowerCase()}: ${entity}; ${callbacks} }`,
  };
  const files: Record<string, string | null> = {
    ...resultFiles(result.root, id),
    [`${result.web}/src/routes/greeting/index.ts`]: null,
    [`${route}/index.ts`]: `export { ${plural}Page } from './${plural}Page';`,
    [`${route}/use${plural}.ts`]: `export type ${entity} = RouterOutputs['${brief}']['list'][number]; export type Create${entity} = RouterInputs['${brief}']['create'];`,
    [`${route}/use${entity}Form.ts`]: `export const use${entity}Form = () => 1;`,
    [`${route}/${entity.toLowerCase()}FormSchema.ts`]: 'export const schema = 1;',
    [`${route}/${plural}Page.test.tsx`]: 'export {};',
    ...Object.fromEntries(
      Object.entries(props).map(([name, parameters]) => [
        `${route}/${name}.tsx`,
        `import type { ${entity}, Create${entity} } from './use${plural}'; export function ${name}(${parameters}) { return <div />; }`,
      ]),
    ),
  };
  const options = { results: [reference, todo, result] };
  return { files, route, options, entity, plural };
}

describe.each(['todo', 'notes'] as const)('%s canonical route inventory', (brief) => {
  const { files, route, options, entity, plural } = canonicalRoute(brief);
  const component = `${route}/${entity}Form.tsx`;
  const form = files[component] ?? '';
  const page = `${route}/${plural}Page.tsx`;
  const changes = {
    'missing barrel': { [`${route}/index.ts`]: null },
    'missing file': { [`${route}/use${entity}Form.ts`]: null },
    'extra file': { [`${route}/extra.ts`]: 'export const extra = 1;' },
    'wrong barrel': { [`${route}/index.ts`]: 'export const page = 1;' },
    'aliased export': {
      [`${route}/index.ts`]: `${files[`${route}/index.ts`]} export { ${entity}Form as Extra } from './${entity}Form';`,
    },
    'extra component': { [page]: `${files[page]} export function Extra() { return <div />; }` },
    'null component': { [page]: `${files[page]} export function Extra() { return null; }` },
    'component value alias': { [component]: `${form} export const Extra = ${entity}Form;` },
    'default component': {
      [component]: form.replace('export function', 'export default function'),
    },
    'different props': { [component]: form.replace('pending: boolean', 'pending: string') },
    'unresolved props': { [component]: form.replace(/props: \{[^}]+\}/, 'props: Unknown') },
    'optional prop': { [component]: form.replace('pending: boolean', 'pending?: boolean') },
    'callback type': { [component]: form.replace(`Create${entity})`, 'string)') },
    'non-exported component': { [component]: form.replace('export function', 'function') },
  };
  it('passes the reference, generic greeting and canonical brief with co-located tests', () => {
    expect(validate(files, options)).toEqual([]);
  });

  it.each(
    Object.entries(changes),
  )('rejects %s with a repair instruction in the CLI', (_, edits) => {
    const repository = createMonorepo({ ...files, ...edits });
    try {
      const run = runTool('structure.mjs', repository.directory);
      expect(run.status).toBe(1);
      expect(run.output).toContain('trial-route-inventory');
      expect(run.output).toContain('.agents/templates/list-route');
      expect(validate({ ...files, ...edits }, options)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'trial-route-inventory' })]),
      );
    } finally {
      repository.cleanup();
    }
  });
});

describe('route co-location', () => {
  it.each([
    "import { other } from '../other';",
    "export type { App } from '../../App';",
    "const other = import('../other');",
    "import { useTrpc } from '../../api-client/trpc';",
    "import type { AppRouter } from '@repo/api';",
    "import { readFile } from 'node:fs';",
    "import { App } from '/apps/web/src/App';",
    "import { data } from '@/data';",
    'export function useGreeting() { return useQuery({}); }',
  ])('rejects a non-primitive outside the route: %s', (source) => {
    expect(
      validate({
        'apps/web/src/routes/greeting/index.ts': source,
        'apps/web/src/routes/other/index.ts': 'export const other = 1;',
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'route-colocation' })]));
  });

  it('accepts route-local code, UI primitives, the api-client surface and npm packages', () => {
    expect(
      validate({
        'apps/web/src/routes/greeting/index.ts':
          "import './useGreeting'; import { Button } from '@repo/ui'; import { useTrpc } from '../../api-client'; import { useMemo } from 'react';",
        'apps/web/src/routes/greeting/useGreeting.ts':
          "import { useTrpc } from '../../api-client'; export function useGreeting() { const trpc = useTrpc(); return useQuery(trpc.greeting.queryOptions()); }",
      }),
    ).toEqual([]);
  });
});

describe('single-route feature placement', () => {
  const feature = `${todo.web}/src/features/page-header/PageHeader.tsx`;
  const report = `${todo.web}/etc/features-page-header.api.md`;
  const violation = (path: string, result = todo) => ({
    kind: 'single-route-features',
    result: result.root,
    route: 'greeting',
    path,
  });

  it.each([
    reference,
    todo,
  ])('keeps feature code and artifacts in the sole route of $id', (result) => {
    const paths = [
      `${result.web}/etc/features-page-header.api.md`,
      `${result.web}/src/features/page-header/PageHeader.test.tsx`,
      `${result.web}/src/features/page-header/PageHeader.tsx`,
      `${result.web}/src/features/page-header/index.ts`,
    ];
    expect(validate(Object.fromEntries(paths.map((path) => [path, ''])))).toEqual(
      paths.map((path) => violation(path, result)),
    );
  });

  it('accepts the header and its test inside the route', () => {
    expect(
      validate({
        [`${todo.web}/src/routes/greeting/PageHeader.tsx`]: 'export const PageHeader = 1;',
        [`${todo.web}/src/routes/greeting/PageHeader.test.tsx`]: 'export {};',
      }),
    ).toEqual([]);
  });

  it('counts multiple files and nested folders within the same route once', () => {
    expect(
      validate({
        [feature]: '',
        [`${todo.web}/src/routes/greeting/GreetingPage.tsx`]: '',
        [`${todo.web}/src/routes/greeting/details/Details.tsx`]: '',
      }),
    ).toEqual([violation(feature)]);
  });

  it.each([
    'Other.test.tsx',
    'README.md',
    'types.d.ts',
  ])('does not count %s as a second production route', (file) => {
    expect(validate({ [feature]: '', [`${todo.web}/src/routes/other/${file}`]: '' })).toEqual([
      violation(feature),
    ]);
  });

  it('rejects web features and reports even with two production route slices', () => {
    expect(
      validate({
        [feature]: '',
        [report]: '',
        [`${todo.web}/src/routes/other/index.ts`]: 'export const other = 1;',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'single-route-features', path: feature }),
        expect.objectContaining({ kind: 'single-route-features', path: report }),
      ]),
    );
  });

  it('counts routes separately for each result', () => {
    expect(
      validate({
        [feature]: '',
        'apps/web/src/routes/other/index.ts': 'export const other = 1;',
      }),
    ).toEqual([violation(feature)]);
  });

  it('rejects an orphan feature report after its source has moved', () => {
    expect(validate({ [report]: '' })).toEqual([violation(report)]);
  });

  it('rejects features even when the production route is missing', () => {
    expect(validate({ [feature]: '', [`${todo.web}/src/routes/greeting/index.ts`]: null })).toEqual(
      [
        { kind: 'missing-role', result: todo.root, role: 'web-routes' },
        { ...violation(feature), route: '<route>' },
      ],
    );
  });
});

describe('node tooling/architecture/structure.mjs', () => {
  it('rejects single-route features and names the route and artifact cleanup', () => {
    const repository = createMonorepo({
      ...resultFiles('showcase/x', 'x'),
      'showcase/x/web/src/features/page-header/PageHeader.tsx':
        'export function PageHeader() { return <h1>Greeting</h1>; }',
      'showcase/x/web/src/features/page-header/index.ts':
        "export { PageHeader } from './PageHeader';",
      'showcase/x/web/src/routes/greeting/index.ts':
        "import { PageHeader } from '../../features/page-header';\nexport const greeting = PageHeader;",
      'showcase/x/web/etc/features-page-header.api.md':
        'export declare function PageHeader(): void;',
    });
    try {
      const run = runTool('structure.mjs', repository.directory);
      expect(run.status).toBe(1);
      expect(run.output).toContain(
        'single-route-features showcase/x/web/src/features/page-header/PageHeader.tsx:',
      );
      expect(run.output).toContain(
        'single-route-features showcase/x/web/etc/features-page-header.api.md:',
      );
      expect(run.output).toContain('web/src/routes/greeting/');
      expect(run.output).toContain('remove the feature barrel and API report');
      expect(run.output).toContain('route-colocation');
    } finally {
      repository.cleanup();
    }
  });

  it('prints unsupported exports alongside other violations instead of aborting validation', () => {
    const repository = createMonorepo({
      ...resultFiles('showcase/x', 'x'),
      'apps/web/etc/api-client.api.md': CLIENT_EXPORTS.join('\n'),
      'showcase/x/web/etc/api-client.api.md': 'export namespace Extra {}',
      'showcase/x/web/src/App.tsx': `// @ts-${'ignore'}\nexport const App = 1;`,
    });
    try {
      const run = runTool('structure.mjs', repository.directory);
      expect(run.status).toBe(1);
      expect(run.output).toContain(
        'scaffold-exports showcase/x/web/etc/api-client.api.md: Unsupported scaffold API export: export namespace Extra {}',
      );
      expect(run.output).toContain('suppression showcase/x/web/src/App.tsx:1:');
    } finally {
      repository.cleanup();
    }
  });

  it('prints OK with the number of results on a clean tree', () => {
    const repository = createMonorepo(resultFiles('showcase/x', 'x'));
    try {
      expect(runTool('structure.mjs', repository.directory)).toEqual({
        status: 0,
        output: expect.stringMatching(/^OK: 2 results/),
      });
    } finally {
      repository.cleanup();
    }
  });

  it('fails a committed symlink to a folder inside a result', () => {
    const repository = createMonorepo({});
    try {
      symlinkSync('../src', join(repository.directory, 'apps/web/e2e/linked'));
      const run = runTool('structure.mjs', repository.directory);
      expect(run.status).toBe(1);
      expect(run.output).toMatch(/symlink apps\/web\/e2e\/linked/);
    } finally {
      repository.cleanup();
    }
  });

  it('fails when --root names no folder', () => {
    const run = runTool('structure.mjs', '');
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/--root needs a folder/);
  });

  it('fails a showcase result with a missing role and an import from the reference', () => {
    const repository = createMonorepo({
      ...resultFiles('showcase/x', 'x'),
      'showcase/x/api/src/trpc.ts': null,
      'showcase/x/web/src/api-client/index.ts':
        "import type { AppRouter } from '../../../../../apps/api/src/router.ts';\nexport const ApiProvider = 1;\nexport type Router = AppRouter;\n",
    });
    try {
      const run = runTool('structure.mjs', repository.directory);
      expect(run.status).toBe(1);
      expect(run.output).toMatch(/missing-role .*showcase\/x.*api-trpc/);
      expect(run.output).toMatch(
        /cross-result-import .*showcase\/x\/web\/src\/api-client\/index\.ts.*apps\/api\/src\/router\.ts/,
      );
    } finally {
      repository.cleanup();
    }
  });
});
