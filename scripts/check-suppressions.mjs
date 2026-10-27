#!/usr/bin/env node
/**
 * Every TypeScript suppression is a `@ts-expect-error` with its reason.
 *
 * TypeScript cannot hold this rule itself: a directive silences the error that
 * would report it. This script reads every tracked source file, so it covers
 * every workspace package, `scripts/`, `tooling/`, and the root configs.
 * ESLint ignores and reports every inline `eslint-disable*` comment
 * (`noInlineConfig`, ADR 0039), and Biome refuses a `biome-ignore` without a
 * reason. Inline Oxlint rule directives are rejected here.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SOURCE_FILES = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'];
const TS_DIRECTIVE = /\/\/\s*@ts-(ignore|nocheck|expect-error)\b(.*)$/;
const MINIMUM_REASON_LENGTH = 10;

const MESSAGES = {
  oxlint:
    'changes Oxlint rules inline. Fix the code instead of disabling or enabling rules in comments.',
  reason:
    'has no reason. Add it, for example `// @ts-expect-error <why this line is the exception>`.',
  'ts-ignore': 'is `@ts-ignore`. Use `// @ts-expect-error <reason>`, which fails once fixed.',
  'ts-nocheck': 'turns off type checking for the file. Fix the types instead.',
};

function typeScriptKind(directive, rest) {
  if (directive !== 'expect-error') {
    return `ts-${directive}`;
  }

  return rest.replace(/^[\s:-]+/, '').trim().length < MINIMUM_REASON_LENGTH ? 'reason' : undefined;
}

function kindOf(line) {
  const typeScript = line.match(TS_DIRECTIVE);

  return typeScript ? typeScriptKind(typeScript[1], typeScript[2]) : undefined;
}

function commentPositions(node) {
  const children = node.getChildren();

  return children.length
    ? children.flatMap(commentPositions)
    : ts.isJsxText(node)
      ? []
      : [node.pos];
}

function oxlintSuppressions(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);

  const ranges = [...new Set(commentPositions(source))].flatMap((position) => [
    ...(ts.getLeadingCommentRanges(text, position) ?? []),
    ...(ts.getTrailingCommentRanges(text, position) ?? []),
  ]);

  const comments = new Map(ranges.map((range) => [range.pos, range]));

  return [...comments.values()].flatMap(({ pos, end }) => {
    const directive = text.slice(pos + 2, end).match(/^\s*\*?\s*(oxlint-(?:disable|enable)\b)/m);

    if (!directive) {
      return [];
    }

    const position = pos + 2 + directive.index + directive[0].indexOf(directive[1]);

    return [{ line: source.getLineAndCharacterOfPosition(position).line + 1, kind: 'oxlint' }];
  });
}

/** Report type suppression violations and inline Oxlint directives in actual comments. */
export function findUnreasonedSuppressions(text, fileName = 'source.tsx') {
  const typeScript = text
    .split('\n')
    .map((line, index) => ({ line: index + 1, kind: kindOf(line) }))
    .filter(({ kind }) => kind);

  return [...typeScript, ...oxlintSuppressions(text, fileName)].sort((a, b) => a.line - b.line);
}

function runCli() {
  const paths = execFileSync('git', ['ls-files', ...SOURCE_FILES], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path && !path.startsWith('vendor/'));

  const failures = paths.flatMap((path) =>
    findUnreasonedSuppressions(readFileSync(path, 'utf8'), path).map(
      ({ line, kind }) => `  ✗ ${path}:${line} ${MESSAGES[kind]}`,
    ),
  );

  if (failures.length === 0) {
    console.log(
      `OK: ${paths.length} source files have reasoned type suppressions and no inline Oxlint directives.`,
    );

    return;
  }

  console.error('Suppression policy violations:\n');
  console.error(failures.join('\n'));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
