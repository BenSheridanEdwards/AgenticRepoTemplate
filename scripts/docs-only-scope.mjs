#!/usr/bin/env node
/** Decide docs-only scope; unknown inputs keep the full CI work enabled. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { matchesGlob, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

/* Skipped-lane reader audit:
 * test: jest.config.ts selects web/api src tests and package src tests;
 * no current app test imports Markdown. Exclude result/package trees for fixtures.
 * coverage: confidence-label.mjs --coverage-gate reads coverage JSON, changed
 * source paths and PRD mappings; docs/prd remains covered by always-run confidence.
 * e2e: playwright.config.ts reads result web/e2e behaviour maps, acceptance
 * specs in tooling/trial/acceptance and app servers; no prose imports found.
 * build: recursive package build scripts use tsc/Vite source and public assets;
 * size-limit reads apps/web/dist assets. No docs or README bundling configured.
 * fallow: .fallowrc.jsonc analyzes code/config entry points, not Markdown;
 * this lane also runs arch:diagram and api:check, which read architecture.mmd,
 * the docs architecture directory and package API reports. Keep those fully checked.
 * CodeQL: codeql.yml selects javascript-typescript, with no Markdown inputs.
 * Quality, tooling, PR quality, enforcement and confidence always run, covering
 * guidance, PRDs, trials, prompts, templates and required-gates documentation.
 */
const EXCLUDED = [
  'docs/architecture/**',
  '**/architecture.mmd',
  '**/etc/*.api.md',
  'apps/**',
  'packages/**',
  'showcase/**',
  '**/e2e/**',
  'tooling/trial/acceptance/**',
];

/** @param {string[]} paths */
export function docsOnly(paths) {
  return (
    paths.length > 0 &&
    paths.every(
      (path) =>
        posix.normalize(path) === path &&
        !path.includes('\\') &&
        (path.endsWith('.md') || matchesGlob(path, 'docs/**')) &&
        !EXCLUDED.some((pattern) => matchesGlob(path, pattern)),
    )
  );
}

function runCli(range) {
  let result = false;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    try {
      // Both sides of moves and deletions count; NUL keeps unusual names intact.
      const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', ...range], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\0')
        .filter(Boolean);
      result = docsOnly(paths);
    } catch {
      result = false;
    }
  }
  const output = `docs-only=${result}\n`;
  console.log(output.trim());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      result ? 'Docs-only: documentation changed.\n' : 'Full CI work required.\n',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv.length > 2 ? process.argv.slice(2) : ['HEAD^1', 'HEAD']);
}
