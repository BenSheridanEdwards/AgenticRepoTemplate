/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide, latestConclusion, treeAlreadyPassed } from './main-tree-passed.mjs';

const TREE = 'tree-of-main';
const merged = {
  merged: true,
  baseRef: 'main',
  headTree: TREE,
  requiredGates: 'success',
};

describe('treeAlreadyPassed', () => {
  it('skips the rerun when a merged PR head has the same tree and passed', () => {
    expect(treeAlreadyPassed({ mainTree: TREE, pulls: [merged] })).toBe(true);
  });

  it.each([
    ['the tree differs', { ...merged, headTree: 'other-tree' }],
    ['the gates failed', { ...merged, requiredGates: 'failure' }],
    ['the gates never ran', { ...merged, requiredGates: 'missing' }],
    ['the PR is not merged', { ...merged, merged: false }],
    ['the PR targets another branch', { ...merged, baseRef: 'release' }],
  ])('runs CI when %s', (_label, pull) => {
    expect(treeAlreadyPassed({ mainTree: TREE, pulls: [pull] })).toBe(false);
  });

  it('runs CI for a direct push with no PR', () => {
    expect(treeAlreadyPassed({ mainTree: TREE, pulls: [] })).toBe(false);
  });
});

describe('latestConclusion', () => {
  it('reads the most recently completed Required gates run', () => {
    const runs = [
      { name: 'Required gates', conclusion: 'success', completed_at: '2026-10-31T10:00:00Z' },
      { name: 'Required gates', conclusion: 'failure', completed_at: '2026-10-31T11:00:00Z' },
      { name: 'Other', conclusion: 'success', completed_at: '2026-10-31T12:00:00Z' },
      { name: 'Required gates', conclusion: null, completed_at: null },
    ];
    expect(latestConclusion(runs)).toBe('failure');
  });

  it('reports missing when no Required gates run completed', () => {
    expect(latestConclusion([])).toBe('missing');
  });
});

describe('decide', () => {
  const responses = new Map([
    ['git/commits/main-sha', { tree: { sha: TREE } }],
    [
      'commits/main-sha/pulls',
      [{ head: { sha: 'head-sha' }, base: { ref: 'main' }, merged_at: '2026-10-31T11:00:00Z' }],
    ],
    ['git/commits/head-sha', { tree: { sha: TREE } }],
    [
      'commits/head-sha/check-runs?check_name=Required%20gates&per_page=100',
      {
        check_runs: [
          { name: 'Required gates', conclusion: 'success', completed_at: '2026-10-31T10:00:00Z' },
        ],
      },
    ],
  ]);
  const api = async (path: string) => {
    if (!responses.has(path)) throw new Error(`unexpected ${path}`);
    return responses.get(path);
  };

  it('skips the rerun when the API shows the merged head passed with this tree', async () => {
    await expect(decide({ api, sha: 'main-sha' })).resolves.toBe(true);
  });

  it('fails closed and runs CI when the API errors', async () => {
    const failing = async () => {
      throw new Error('HTTP 500');
    };
    await expect(decide({ api: failing, sha: 'main-sha' })).resolves.toBe(false);
  });
});

describe('workflow wiring', () => {
  const workflow = (name: string) =>
    readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

  it('starts CI on main only through the tree check', () => {
    expect(workflow('ci.yml')).not.toMatch(/^ {2}push:/m);
    expect(workflow('ci.yml')).toMatch(/^ {2}workflow_dispatch:/m);
    expect(workflow('main-tree.yml')).toContain('run: node scripts/main-tree-passed.mjs');
    expect(workflow('main-tree.yml')).toContain('gh workflow run ci.yml');
  });
});
