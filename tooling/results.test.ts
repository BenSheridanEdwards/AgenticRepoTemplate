/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { listResults } from './results.mjs';

function withTree(paths: string[], check: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'results-'));
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), '{}\n');
    }
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('listResults', () => {
  it('lists the reference result in apps/ alone when there is no showcase', () => {
    withTree(['apps/web/package.json', 'apps/api/package.json'], (root) => {
      expect(listResults(root)).toEqual([
        {
          id: 'reference',
          root: 'apps',
          scope: 'repo',
          web: 'apps/web',
          api: 'apps/api',
          ports: { web: 5173, api: 3001 },
        },
      ]);
    });
  });

  it('adds each complete showcase result sorted by id, ten ports apart', () => {
    const tree = [
      'apps/web/package.json',
      'apps/api/package.json',
      'showcase/todo-02/web/package.json',
      'showcase/todo-02/api/package.json',
      'showcase/todo-01/web/package.json',
      'showcase/todo-01/api/package.json',
      'showcase/half-done/web/package.json',
      'showcase/README.md',
    ];
    withTree(tree, (root) => {
      expect(
        listResults(root).map(({ id, root: resultRoot, scope, ports }) => ({
          id,
          resultRoot,
          scope,
          ports,
        })),
      ).toEqual([
        { id: 'reference', resultRoot: 'apps', scope: 'repo', ports: { web: 5173, api: 3001 } },
        {
          id: 'todo-01',
          resultRoot: 'showcase/todo-01',
          scope: 'todo-01',
          ports: { web: 5183, api: 3011 },
        },
        {
          id: 'todo-02',
          resultRoot: 'showcase/todo-02',
          scope: 'todo-02',
          ports: { web: 5193, api: 3021 },
        },
      ]);
    });
  });
});
