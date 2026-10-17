#!/usr/bin/env node
/**
 * Every lint or type suppression names its rule and carries its reason.
 *
 * ESLint cannot hold this rule itself: a blanket disable comment also silences
 * the rule that would report it. This script reads every tracked source file,
 * so it covers every workspace package (`apps/*`), `scripts/`, `tooling/`, and
 * the root configs. Biome already refuses a `biome-ignore` without a reason.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOURCE_FILES = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs'];
const ESLINT_DIRECTIVE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b([^\n]*?)(?:\*\/|$)/;
const TS_DIRECTIVE = /\/\/\s*@ts-(ignore|nocheck|expect-error)\b(.*)$/;
const MINIMUM_REASON_LENGTH = 10;

const MESSAGES = {
  blanket:
    'names no rule. Disable one named rule: `// eslint-disable-next-line <rule> -- <reason>`.',
  reason: 'has no reason. Add it, for example `-- <why this line is the exception>`.',
  'ts-ignore': 'is `@ts-ignore`. Use `// @ts-expect-error <reason>`, which fails once fixed.',
  'ts-nocheck': 'turns off type checking for the file. Fix the types instead.',
};

function eslintKind(rest) {
  const [rules, reason = ''] = rest.split(/\s--\s/);
  if (rules.trim() === '') {
    return 'blanket';
  }
  return reason.trim() === '' ? 'reason' : undefined;
}

function typeScriptKind(directive, rest) {
  if (directive !== 'expect-error') {
    return `ts-${directive}`;
  }
  return rest.replace(/^[\s:-]+/, '').trim().length < MINIMUM_REASON_LENGTH ? 'reason' : undefined;
}

function kindOf(line) {
  const eslint = line.match(ESLINT_DIRECTIVE);
  if (eslint) {
    return eslintKind(eslint[1]);
  }
  const typeScript = line.match(TS_DIRECTIVE);
  return typeScript ? typeScriptKind(typeScript[1], typeScript[2]) : undefined;
}

/**
 * Each `{ line, kind }` where `text` suppresses a check without naming a rule
 * or giving a reason. Pure.
 *
 * @param {string} text source code
 */
export function findUnreasonedSuppressions(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, kind: kindOf(line) }))
    .filter(({ kind }) => kind);
}

function runCli() {
  const paths = execFileSync('git', ['ls-files', ...SOURCE_FILES], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path && !path.startsWith('vendor/'));
  const failures = paths.flatMap((path) =>
    findUnreasonedSuppressions(readFileSync(path, 'utf8')).map(
      ({ line, kind }) => `  ✗ ${path}:${line} ${MESSAGES[kind]}`,
    ),
  );
  if (failures.length === 0) {
    console.log(`OK: every suppression in ${paths.length} source files names a rule and a reason.`);
    return;
  }
  console.error('Suppressions without a rule or a reason:\n');
  console.error(failures.join('\n'));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
