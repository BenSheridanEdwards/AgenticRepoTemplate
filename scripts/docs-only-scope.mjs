#!/usr/bin/env node
/** Decide docs-only scope; unknown inputs keep the full CI work enabled. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { matchesGlob, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

/* Reader audit (conservatively exclude every Markdown file):
 * scripts/check-doc-phrasing.mjs: root *.md, .agents/**, .github/**, docs/** Markdown.
 * scripts/check-sign-off-docs.mjs: guidance Markdown selected by isGuidanceDoc.
 * scripts/check-context-layer.mjs: AGENTS.md, REVIEW.md, .agents/**,
 * .claude/CLAUDE.md, .cursor/BUGBOT.md, docs/NORTH_STAR.md, docs/GLOSSARY.md.
 * scripts/check-dependency-adr.mjs: .agents/decisions/*.md.
 * scripts/check-prd-conflicts.mjs, confidence-label.mjs, validate-pr-body.mjs:
 * docs/prd/*.md; validate-pr-body also reads docs/NORTH_STAR.md history and proof.
 * scripts/enforcement-approval.mjs: docs/prd/** and docs/NORTH_STAR.md diffs.
 * scripts/required-gates.mjs and its test: docs/required-gates.md.
 * scripts/api-report.mjs, tooling/architecture/structure.mjs,
 * tooling/trial/result-facts.mjs: package etc/*.api.md reports.
 * tooling/architecture/diagram.mjs, package.json, .github/workflows/ci.yml:
 * docs/architecture/roles.mmd and result architecture.mmd.
 * tooling/trial/{compare,evidence,run-trial}.mjs and tests: docs/trials/**,
 * tooling/trial/*-prompt.md, .agents/templates/*.md and agent guidance.
 * scripts/check-anti-slop-vendor.mjs and tests: vendor anti-slop UPSTREAM.md.
 * .agents/ skills and templates reference guidance, proof and E2E behaviour maps.
 * Jest/ESLint/tsconfig configs add no prose allowlist. All scripts, tooling,
 * configs, packages, lockfiles and workflow paths remain outside the allowlist.
 */
const EXCLUDED = ['docs/architecture/**', 'docs/proof/**', 'docs/prd/**', 'docs/trials/**'];

/** @param {string[]} paths */
export function docsOnly(paths) {
  return (
    paths.length > 0 &&
    paths.every(
      (path) =>
        posix.normalize(path) === path &&
        !path.includes('\\') &&
        matchesGlob(path, 'docs/**/*.txt') &&
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
      result ? 'Docs-only: plain text documentation changed.\n' : 'Full CI work required.\n',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv.length > 2 ? process.argv.slice(2) : ['HEAD^1', 'HEAD']);
}
