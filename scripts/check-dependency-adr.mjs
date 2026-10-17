#!/usr/bin/env node
/**
 * A new tool or dependency needs an ADR in the same change.
 *
 * The CLI compares `package.json` at the merge base with the base ref against
 * the working tree, and lists the files the change adds. Any dependency name
 * that is new in head fails the check unless the change also adds an ADR under
 * `.agents/decisions/`. Version bumps of existing names never count.
 *
 * The base ref is `origin/$GITHUB_BASE_REF` in a pull request, else the first
 * argument, else `origin/main`. An unresolvable base fails closed.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const DECISIONS_DIRECTORY = '.agents/decisions';
const ADR_PATH = /^\.agents\/decisions\/\d{4}-[a-z0-9-]+\.md$/;

function dependencyNames(packageJson) {
  return new Set(DEPENDENCY_FIELDS.flatMap((field) => Object.keys(packageJson?.[field] ?? {})));
}

/**
 * The dependency names head adds over base, or none when the change adds an
 * ADR. Pure.
 *
 * @param {{ basePackageJson: object, headPackageJson: object, addedPaths: string[] }} change
 * @returns {string[]}
 */
export function findDependenciesWithoutAdr({ basePackageJson, headPackageJson, addedPaths }) {
  if (addedPaths.some((path) => ADR_PATH.test(path))) {
    return [];
  }
  const existing = dependencyNames(basePackageJson);
  return [...dependencyNames(headPackageJson)].filter((name) => !existing.has(name));
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function nextAdrNumber() {
  let highest = 0;
  try {
    for (const file of readdirSync(DECISIONS_DIRECTORY)) {
      highest = Math.max(highest, Number(file.match(/^(\d{4})-/)?.[1] ?? 0));
    }
  } catch {
    // No decisions directory yet: the first ADR is 0001.
  }
  return String(highest + 1).padStart(4, '0');
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

  let basePackageJson = {};
  try {
    basePackageJson = JSON.parse(git('show', `${mergeBase}:package.json`));
  } catch {
    // No package.json at the base: every dependency in head is new.
  }
  const headPackageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const addedPaths = git('diff', '--name-only', '--diff-filter=A', '-z', mergeBase, 'HEAD')
    .split('\0')
    .filter(Boolean);

  const missing = findDependenciesWithoutAdr({ basePackageJson, headPackageJson, addedPaths });
  if (missing.length === 0) {
    console.log(`OK: no new dependency without an ADR since ${baseRef}.`);
    process.exit(0);
  }

  console.error(`New dependencies since ${baseRef} without an ADR in this change:\n`);
  for (const name of missing) {
    console.error(`  ✗ ${name}`);
  }
  console.error(
    `\nAdd \`${DECISIONS_DIRECTORY}/NNNN-<slug>.md\` (next number: ${nextAdrNumber()}) explaining ` +
      'why the new tool is needed and what it replaces, per ' +
      '`.agents/decisions/0001-record-architecture-decisions.md`.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  runCli(githubBaseRef ? `origin/${githubBaseRef}` : (process.argv[2] ?? 'origin/main'));
}
