#!/usr/bin/env node
/**
 * A new tool or dependency needs an ADR in the same change.
 *
 * The CLI compares the committed `package.json` at the merge base with the base
 * ref against `HEAD`, and reads the ADRs the change adds. Any dependency name
 * that is new in head fails the check unless an ADR added under
 * `.agents/decisions/` names it. Version bumps of existing names never count.
 *
 * The base ref is `origin/$GITHUB_BASE_REF` in a pull request, else the first
 * argument, else `origin/main`. An unresolvable base fails closed.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
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
 * The dependency names head adds over base that no added ADR names. Pure.
 *
 * @param {{ basePackageJson: object, headPackageJson: object, addedAdrs: { path: string, text: string }[] }} change
 * @returns {string[]}
 */
export function findDependenciesWithoutAdr({ basePackageJson, headPackageJson, addedAdrs }) {
  const existing = dependencyNames(basePackageJson);
  const adrText = addedAdrs
    .filter(({ path }) => ADR_PATH.test(path))
    .map(({ text }) => text)
    .join('\n');
  return [...dependencyNames(headPackageJson)].filter(
    (name) => !(existing.has(name) || adrText.includes(name)),
  );
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
  const headPackageJson = JSON.parse(git('show', 'HEAD:package.json'));
  const addedAdrs = git('diff', '--name-only', '--diff-filter=A', '-z', mergeBase, 'HEAD')
    .split('\0')
    .filter((path) => ADR_PATH.test(path))
    .map((path) => ({ path, text: git('show', `HEAD:${path}`) }));

  const missing = findDependenciesWithoutAdr({ basePackageJson, headPackageJson, addedAdrs });
  if (missing.length === 0) {
    console.log(`OK: no new dependency without an ADR since ${baseRef}.`);
    process.exit(0);
  }

  console.error(`New dependencies since ${baseRef} that no ADR in this change names:\n`);
  for (const name of missing) {
    console.error(`  ✗ ${name}`);
  }
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
