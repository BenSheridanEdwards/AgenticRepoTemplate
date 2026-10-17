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
const todo = resultAt('todo-01', 'showcase/todo-01', 'todo-01');

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
    contract,
    results,
    files,
    edges,
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

describe('node tooling/architecture/structure.mjs', () => {
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
