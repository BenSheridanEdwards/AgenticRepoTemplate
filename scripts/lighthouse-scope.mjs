#!/usr/bin/env node
/**
 * Decide whether a pull request is UI-relevant, so `lighthouse.yml` audits it.
 *
 * A pull request is UI-relevant when it changes a file that can change the
 * shipped bundle or the audit itself. Test files under `src/` never ship, so
 * they do not count. When nothing UI-relevant changes, the Lighthouse job
 * reports green without auditing; this rule is that skip, kept here so it is
 * tested (ADR 0017).
 *
 * The CLI diffs `HEAD^1..HEAD` by default, which on a `pull_request` checkout is
 * exactly the PR's change. Pass a range to run it locally, for example
 * `node scripts/lighthouse-scope.mjs origin/main...HEAD`. It writes
 * `ui-changed=true|false` to `GITHUB_OUTPUT` and a note to
 * `GITHUB_STEP_SUMMARY` when those are set.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Directories whose files ship in the bundle. */
const UI_DIRECTORIES = ['src/', 'public/'];

/** Root files that change the bundle, the build, or the audit. */
const UI_FILES = new Set([
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'pnpm-lock.yaml',
  '.nvmrc',
  'lighthouserc.json',
  '.github/workflows/lighthouse.yml',
  'scripts/lighthouse-scope.mjs',
]);

const SOURCE_TEST_FILE = /^src\/(?:.*\/)?[^/]*\.test\.[^/]*$/;

/** @param {string} path */
function isUiRelevant(path) {
  if (SOURCE_TEST_FILE.test(path)) {
    return false;
  }
  return UI_FILES.has(path) || UI_DIRECTORIES.some((directory) => path.startsWith(directory));
}

/**
 * Keep the changed paths that make a pull request UI-relevant. Pure.
 *
 * @param {string[]} paths repository-relative paths, as `git diff --name-only` prints them
 * @returns {string[]}
 */
export function uiRelevantFiles(paths) {
  return paths.filter(isUiRelevant);
}

function runCli(range) {
  // --no-renames lists a moved file's old path too; -z keeps non-ASCII names unquoted.
  const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', ...range], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const files = uiRelevantFiles(changed);
  const summary =
    files.length > 0
      ? `Lighthouse audits run for these UI-relevant files:\n\n\`\`\`\n${files.join('\n')}\n\`\`\`\n`
      : 'Lighthouse audits skipped: this pull request touches only non-UI files.\n';
  console.log(summary);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `ui-changed=${files.length > 0}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv.length > 2 ? process.argv.slice(2) : ['HEAD^1', 'HEAD']);
}
