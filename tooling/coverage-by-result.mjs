#!/usr/bin/env node
/**
 * Holds every result to the coverage threshold on its own, so one result
 * cannot hide behind another's coverage in the global total (ADR 0034).
 * `pnpm test:coverage` runs it after Jest writes `coverage/coverage-summary.json`.
 * The global threshold in `jest.config.ts` still applies, and still covers
 * `packages/ui`, which belongs to no result.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listResults } from './results.mjs';

const THRESHOLD = 80;
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const SUMMARY = 'coverage/coverage-summary.json';

/**
 * @typedef {{ total: number, covered: number }} Count
 * @typedef {Record<string, Record<string, Count>>} CoverageSummary  Jest's json-summary: absolute path (or "total") to metric counts
 */

/** Each metric's covered and total counts over the files of one result. */
function totals(files) {
  return Object.fromEntries(
    METRICS.map((name) => [
      name,
      files.reduce(
        (sum, counts) => ({
          covered: sum.covered + counts[name].covered,
          total: sum.total + counts[name].total,
        }),
        { covered: 0, total: 0 },
      ),
    ]),
  );
}

/** Istanbul's percentage, floored to two decimals, which Jest's global threshold compares. */
const percent = ({ covered, total }) =>
  total === 0 ? 100 : Math.floor((1000 * 100 * covered) / total / 10) / 100;

/**
 * One line per result and metric under the threshold, or per result with no
 * source in the summary.
 *
 * @param {CoverageSummary} summary
 * @param {readonly import('./results.d.mts').Result[]} results
 * @param {string} root
 */
export function coverageShortfalls(summary, results, root) {
  const entries = Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, counts]) => [relative(root, path), counts]);
  return results.flatMap(({ id, web, api }) => {
    const files = entries
      .filter(([path]) => path.startsWith(`${web}/`) || path.startsWith(`${api}/`))
      .map(([, counts]) => counts);
    if (files.length === 0) {
      return [`${id}: no source file in the coverage summary`];
    }
    const sums = totals(files);
    return METRICS.filter((name) => percent(sums[name]) < THRESHOLD).map(
      (name) => `${id}: ${name} ${percent(sums[name]).toFixed(2)}% < ${THRESHOLD}%`,
    );
  });
}

function main(root) {
  const path = join(root, SUMMARY);
  if (!existsSync(path)) {
    console.error(`${SUMMARY} is missing. Run Jest with coverage first (pnpm test:coverage).`);
    return 1;
  }
  const results = listResults(root);
  const shortfalls = coverageShortfalls(JSON.parse(readFileSync(path, 'utf8')), results, root);
  if (shortfalls.length > 0) {
    console.error(`Coverage per result is under ${THRESHOLD}%:\n${shortfalls.join('\n')}`);
    return 1;
  }
  console.log(
    `Coverage per result is at ${THRESHOLD}% or more: ${results.map(({ id }) => id).join(', ')}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.cwd()));
}
