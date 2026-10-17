#!/usr/bin/env node
// License-compliance gate: fails when any dependency carries a license outside
// the permissive allow-list. Uses pnpm's built-in license listing over every
// workspace package (--recursive), so it adds no extra dependency and resolves
// the pnpm tree correctly.
// See .agents/project/TECH_STACK.md.
import { execSync } from 'node:child_process';

// SPDX identifiers we accept. All permissive. MPL-2.0 is weak (file-level)
// copyleft and is allowed for dependencies — e.g. axe-core, pulled in by the
// accessibility gate. Adding to this list is a deliberate, reviewable act.
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'Python-2.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'WTFPL',
  'Zlib',
  'MPL-2.0',
]);

// Handle SPDX expressions: `(A OR B)` passes if either is allowed; `A AND B`
// passes only if both are. Anything unrecognised fails closed.
function isAllowed(expression) {
  const expr = expression.replace(/[()]/g, '').trim();
  if (expr.includes(' OR ')) {
    return expr.split(' OR ').some((part) => isAllowed(part));
  }
  if (expr.includes(' AND ')) {
    return expr.split(' AND ').every((part) => isAllowed(part));
  }
  return ALLOWED.has(expr.trim());
}

let raw;
try {
  raw = execSync('pnpm --recursive licenses list --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  console.error('license-check: could not run `pnpm --recursive licenses list` —', error.message);
  process.exit(1);
}

const byLicense = JSON.parse(raw);
const violations = [];
for (const [license, packages] of Object.entries(byLicense)) {
  if (isAllowed(license)) {
    continue;
  }
  const list = Array.isArray(packages) ? packages : [];
  const names = list.map((pkg) => pkg.name ?? String(pkg)).slice(0, 12);
  violations.push({ license, count: list.length, names });
}

if (violations.length > 0) {
  console.error('✗ License compliance: dependency license(s) outside the allow-list:\n');
  for (const violation of violations) {
    console.error(`  ${violation.license}  (${violation.count}): ${violation.names.join(', ')}`);
  }
  console.error(
    '\nReview the license, then either remove the dependency or add the SPDX id to' +
      '\nthe allow-list in scripts/license-check.mjs (a deliberate, reviewable change).',
  );
  process.exit(1);
}

const distinct = Object.keys(byLicense).length;
console.log(
  `✓ License compliance: every dependency is under the permissive allow-list (${distinct} distinct licenses).`,
);
