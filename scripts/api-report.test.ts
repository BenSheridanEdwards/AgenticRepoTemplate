/**
 * @jest-environment node
 */
import { listPublicEntries } from './api-report.mjs';

const MANIFESTS: Record<string, { name: string; exports?: unknown }> = {
  'apps/web/package.json': { name: '@repo/web' },
  'apps/api/package.json': { name: '@repo/api', exports: { '.': { types: './src/router.ts' } } },
  'packages/ui/package.json': { name: '@repo/ui', exports: { '.': './src/index.ts' } },
  'showcase/todo-01/api/package.json': {
    name: '@todo-01/api',
    exports: { '.': { types: './src/router.ts' } },
  },
};

const FILES = [
  ...Object.keys(MANIFESTS),
  'apps/web/src/api-client/index.ts',
  'apps/web/src/routes/greeting/index.ts',
  'apps/web/src/routes/greeting/GreetingPage.tsx',
  'apps/web/src/features/name-input/index.ts',
  'apps/web/src/routes/index.ts',
  'apps/api/src/router.ts',
  'apps/api/src/features/greeting/index.ts',
  'apps/api/src/features/greeting/domain.ts',
  'packages/ui/src/index.ts',
  'showcase/todo-01/api/src/features/todos/index.ts',
  'scripts/api-report.mjs',
];

const readManifest = (path: string) => {
  const manifest = MANIFESTS[path];
  if (!manifest) {
    throw new Error(`no manifest at ${path}`);
  }
  return manifest;
};

describe('listPublicEntries', () => {
  it('lists each package entry and each route, feature and api-client index', () => {
    expect(
      listPublicEntries(FILES, readManifest).map(
        ({ name, entry, packageRoot }) => `${packageRoot}/etc/${name}.api.md <- ${entry}`,
      ),
    ).toEqual([
      'apps/api/etc/api.api.md <- apps/api/src/router.ts',
      'apps/api/etc/features-greeting.api.md <- apps/api/src/features/greeting/index.ts',
      'apps/web/etc/api-client.api.md <- apps/web/src/api-client/index.ts',
      'apps/web/etc/features-name-input.api.md <- apps/web/src/features/name-input/index.ts',
      'apps/web/etc/routes-greeting.api.md <- apps/web/src/routes/greeting/index.ts',
      'packages/ui/etc/ui.api.md <- packages/ui/src/index.ts',
      'showcase/todo-01/api/etc/api.api.md <- showcase/todo-01/api/src/router.ts',
      'showcase/todo-01/api/etc/features-todos.api.md <- showcase/todo-01/api/src/features/todos/index.ts',
    ]);
  });

  it('lists nothing for a package with no exports and no modules', () => {
    expect(listPublicEntries(['apps/web/package.json'], readManifest)).toEqual([]);
  });
});
