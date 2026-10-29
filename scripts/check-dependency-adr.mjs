#!/usr/bin/env node
/**
 * A new tool or dependency needs an ADR in the same change.
 *
 * The CLI compares every committed manifest at the merge base with the base
 * ref against `HEAD`, and reads the ADRs the change adds. The manifests are the
 * root `package.json` plus each workspace package that `pnpm-workspace.yaml`
 * lists at that commit, so a dependency moving between them is not new. Any
 * dependency name that is new in head fails the check unless an ADR added under
 * `.agents/decisions/` names it. Version bumps of existing names never count.
 *
 * The base ref is `origin/$GITHUB_BASE_REF` in a pull request, else the first
 * argument, else `origin/main`. An unresolvable base fails closed.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const DECISIONS_DIRECTORY = '.agents/decisions';
const ADR_PATH = /^\.agents\/decisions\/\d{4}-[a-z0-9-]+\.md$/;
const ROOT_MANIFEST = 'package.json';
const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/** The `packages:` globs of a pnpm workspace file, in block-list form. Throws on any other form. */
function workspaceGlobs(workspaceYaml) {
  const lines = workspaceYaml.split('\n');
  const start = lines.findIndex((line) => /^packages:/.test(line));
  if (start === -1) {
    return [];
  }
  if (!/^packages:\s*(#.*)?$/.test(lines[start])) {
    throw new Error(`${WORKSPACE_FILE}: write \`packages:\` as a block list (\`  - 'apps/*'\`).`);
  }
  const items = lines.slice(start + 1).filter((line) => !/^\s*(#.*)?$/.test(line));
  const end = items.findIndex((line) => !/^\s*-/.test(line));
  const globs = items.slice(0, end === -1 ? undefined : end).map((line) => {
    const item = line.match(/^\s*-\s+(['"]?)([^'"#\s{[]+)\1\s*(#.*)?$/);
    if (!item) {
      throw new Error(`${WORKSPACE_FILE}: cannot read the packages item \`${line.trim()}\`.`);
    }
    return item[2].replace(/^(!?)\.\//, '$1');
  });
  if (globs.length === 0) {
    throw new Error(`${WORKSPACE_FILE}: \`packages:\` lists no globs.`);
  }
  return globs;
}

/**
 * Repo-relative manifest paths: root `package.json` plus each `<glob>/package.json`
 * the workspace file lists. Pure.
 *
 * @param {string | null} workspaceYaml `pnpm-workspace.yaml` at one commit, or null when absent
 * @param {string[]} trackedFiles every tracked path at that commit
 * @returns {string[]}
 */
export function workspaceManifestPaths(workspaceYaml, trackedFiles) {
  const globs = workspaceYaml === null ? [] : workspaceGlobs(workspaceYaml);
  const included = globs.filter((glob) => !glob.startsWith('!'));
  const excluded = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));
  const matchesAny = (path, patterns) =>
    patterns.some((pattern) => matchesGlob(path, `${pattern}/${ROOT_MANIFEST}`));
  const packages = trackedFiles
    .filter((path) => path !== ROOT_MANIFEST && path.endsWith(`/${ROOT_MANIFEST}`))
    .filter((path) => matchesAny(path, included) && !matchesAny(path, excluded))
    .sort();
  return [ROOT_MANIFEST, ...packages];
}

/** Union of dependency names over every manifest at one commit. A `workspace:` spec names a workspace package, not a new dependency. */
function dependencyNames(manifests) {
  return new Set(
    manifests.flatMap((manifest) =>
      DEPENDENCY_FIELDS.flatMap((field) => Object.entries(manifest?.[field] ?? {}))
        .filter(([, spec]) => !String(spec).startsWith('workspace:'))
        .map(([name]) => name),
    ),
  );
}

/**
 * The dependency names head adds over base that no added ADR names. Pure.
 *
 * @param {{ baseManifests: object[], headManifests: object[], addedAdrs: { path: string, text: string }[] }} change
 * @returns {string[]}
 */
export function findDependenciesWithoutAdr({ baseManifests, headManifests, addedAdrs }) {
  const existing = dependencyNames(baseManifests);
  const adrText = addedAdrs
    .filter(({ path }) => ADR_PATH.test(path))
    .map(({ text }) => text)
    .join('\n');
  return [...dependencyNames(headManifests)].filter(
    (name) => !(existing.has(name) || adrText.includes(name)),
  );
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function nextAdrNumber() {
  let highest = 0;
  try {
    highest = readdirSync(DECISIONS_DIRECTORY).reduce(
      (maximum, file) => Math.max(maximum, Number(file.match(/^(\d{4})-/)?.[1] ?? 0)),
      0,
    );
  } catch {
    // No decisions directory yet: the first ADR is 0001.
  }
  return String(highest + 1).padStart(4, '0');
}

function showAt(commit, path) {
  try {
    return git('show', `${commit}:${path}`);
  } catch {
    return null;
  }
}

/** Every manifest committed at `commit`. Only the base may lack a root `package.json`. */
function readManifests(commit, { optional }) {
  const tracked = git('ls-tree', '-r', '-z', '--name-only', commit).split('\0').filter(Boolean);
  if (!(optional || tracked.includes(ROOT_MANIFEST))) {
    throw new Error(`${commit} has no committed ${ROOT_MANIFEST}.`);
  }
  return workspaceManifestPaths(showAt(commit, WORKSPACE_FILE), tracked)
    .map((path) => showAt(commit, path))
    .filter((text) => text !== null)
    .map((text) => JSON.parse(text));
}

function runCli(baseRef) {
  let mergeBase;
  try {
    mergeBase = git('merge-base', baseRef, 'HEAD').trim();
  } catch {
    console.error(
      `✗ Could not resolve the base ref "${baseRef}" to compare package.json against. ` +
        'Run `git fetch origin` (in CI, check out with `fetch-depth: 0`) and retry.',
    );
    process.exit(1);
  }

  const baseManifests = readManifests(mergeBase, { optional: true });
  const headManifests = readManifests('HEAD', { optional: false });
  const addedAdrs = git('diff', '--name-only', '--diff-filter=A', '-z', mergeBase, 'HEAD')
    .split('\0')
    .filter((path) => ADR_PATH.test(path))
    .map((path) => ({ path, text: git('show', `HEAD:${path}`) }));

  const missing = findDependenciesWithoutAdr({ baseManifests, headManifests, addedAdrs });
  if (missing.length === 0) {
    console.log(`OK: no new dependency without an ADR since ${baseRef}.`);
    process.exit(0);
  }

  console.error(`New dependencies since ${baseRef} that no ADR in this change names:\n`);
  missing.forEach((name) => {
    console.error(`  ✗ ${name}`);
  });
  console.error(
    `\nAdd \`${DECISIONS_DIRECTORY}/NNNN-<slug>.md\` (next number: ${nextAdrNumber()}) that names ` +
      'each dependency and explains why it is needed and what it replaces, per ' +
      '`.agents/decisions/0001-record-architecture-decisions.md`.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  runCli(githubBaseRef ? `origin/${githubBaseRef}` : (process.argv[2] ?? 'origin/main'));
}
