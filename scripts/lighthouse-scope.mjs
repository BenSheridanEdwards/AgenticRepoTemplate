#!/usr/bin/env node
/**
 * Decide whether the Lighthouse and visual workflows compare a pull request.
 *
 * A pull request is UI-relevant when it changes a file that can change the
 * shipped bundle or the audit itself: the web app and the ui kit it bundles.
 * Test files under their `src/` folders never ship, so they do not count. When nothing UI-relevant changes, the Lighthouse job
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
import { matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Source folders whose files ship in the bundle; their test files never ship. */
const SOURCE_DIRECTORIES = ['apps/web/src/', 'packages/ui/src/'];

/** Directories whose files ship in the bundle; `public/` ships every file as is. */
const UI_DIRECTORIES = [...SOURCE_DIRECTORIES, 'apps/web/public/'];

/** Files that change the bundle, the build, or either UI comparison. */
const UI_FILES = new Set([
  'apps/web/index.html',
  'apps/web/vite.config.ts',
  'apps/web/package.json',
  'packages/ui/package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'package.json',
  'pnpm-lock.yaml',
  '.nvmrc',
  'tooling/lighthouse/lighthouserc.json',
  '.github/workflows/lighthouse.yml',
  'scripts/lighthouse-scope.mjs',
  'apps/web/e2e/visual.spec.ts',
  'playwright.config.ts',
  '.github/workflows/visual.yml',
]);

const TEST_FILE = /\.test\.[^/]*$/;

/** @param {string} path */
function isUiRelevant(path) {
  if (SOURCE_DIRECTORIES.some((directory) => path.startsWith(directory)) && TEST_FILE.test(path)) {
    return false;
  }
  return (
    UI_FILES.has(path) ||
    UI_DIRECTORIES.some((directory) => path.startsWith(directory)) ||
    matchesGlob(path, 'apps/web/e2e/__screenshots__/*.png')
  );
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
