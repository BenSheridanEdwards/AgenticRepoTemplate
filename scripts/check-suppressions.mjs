#!/usr/bin/env node
/** Reject inline suppressions in tracked source and config comments. */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** @type {{ path: string, directive: string, reason: string }[]} */
export const ALLOWED_SUPPRESSIONS = [];

const SOURCE_FILES = [
  '*.ts',
  '*.tsx',
  '*.mts',
  '*.cts',
  '*.js',
  '*.jsx',
  '*.mjs',
  '*.cjs',
  '*.css',
  '*.json',
  '*.jsonc',
];
const DIRECTIVE =
  /^(?:\s|\*)*(@ts-(?:expect-error|ignore|nocheck)\b|biome-ignore(?:-(?:all|start|end))?\b|(?:oxlint|eslint)-(?:disable|enable)(?:-next-line|-line)?\b|fallow-ignore[\w-]*|(?:istanbul|c8|v8)\s+ignore\b)/;
const BLOCK_CONFIG = /^(?:\s|\*)*(eslint(?:-env)?|globals?)(?=\s)/;
const FIX =
  'Fix the cause. An exception goes in ALLOWED_SUPPRESSIONS in scripts/check-suppressions.mjs, which needs enforcement sign-off.';

function commentPositions(node) {
  const children = node.getChildren();

  return children.length
    ? children.flatMap(commentPositions)
    : ts.isJsxText(node)
      ? []
      : [node.pos];
}

function sourceComments(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const ranges = [...new Set(commentPositions(source))].flatMap((position) => [
    ...(ts.getLeadingCommentRanges(text, position) ?? []),
    ...(ts.getTrailingCommentRanges(text, position) ?? []),
  ]);

  return [...new Map(ranges.map((range) => [range.pos, range])).values()];
}

function configComments(text, fileName) {
  const tokens = fileName.endsWith('.css')
    ? /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?(?:\*\/|$)/g
    : /"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/g;

  return [...text.matchAll(tokens)]
    .filter(([token]) => token.startsWith('/'))
    .map(({ index, 0: token }) => ({ pos: index, end: index + token.length }));
}

/** Report directives only at the beginning of a real comment's body. */
export function findSuppressions(text, fileName = 'source.tsx') {
  const comments = ['.css', '.json', '.jsonc'].includes(extname(fileName))
    ? configComments(text, fileName)
    : sourceComments(text, fileName);

  return comments
    .flatMap(({ pos, end }) => {
      const block = text.startsWith('/*', pos);
      const body = text.slice(
        pos + 2,
        block && text.slice(pos, end).endsWith('*/') ? end - 2 : end,
      );
      const directive = body.match(DIRECTIVE) ?? (block ? body.match(BLOCK_CONFIG) : null);

      if (!directive) return [];

      const position = pos + 2 + directive[0].lastIndexOf(directive[1]);
      return [{ line: text.slice(0, position).split(/\r\n?|\n/).length, kind: directive[1] }];
    })
    .sort((a, b) => a.line - b.line);
}

/** Apply reviewed exceptions and reject entries that no longer match a directive. */
export function checkSuppressions(files, allowed = ALLOWED_SUPPRESSIONS) {
  const directives = files.flatMap(({ path, text }) =>
    findSuppressions(text, path).map((directive) => ({ path, ...directive })),
  );
  const matches = (entry, found) =>
    entry.path === found.path && entry.directive === found.kind && entry.reason.trim().length > 0;

  return [
    ...directives.filter((found) => !allowed.some((entry) => matches(entry, found))),
    ...allowed
      .filter((entry) => !directives.some((found) => matches(entry, found)))
      .map((entry) => ({
        path: entry.path,
        line: 1,
        kind: `stale allowlist entry: ${entry.directive}`,
      })),
  ];
}

function runCli() {
  const paths = execFileSync('git', ['ls-files', '-z', '--', ...SOURCE_FILES], { encoding: 'utf8' })
    .split('\0')
    .filter((path) => path && !path.startsWith('vendor/'));
  const failures = checkSuppressions(
    paths.map((path) => ({ path, text: readFileSync(path, 'utf8') })),
  );

  if (failures.length === 0) {
    console.log(
      `OK: ${paths.length} source and config files have no unallowlisted inline suppressions.`,
    );
    return;
  }

  console.error('Suppression policy violations:\n');
  console.error(failures.map(({ path, line, kind }) => `✗ ${path}:${line} ${kind}`).join('\n'));
  console.error(`\n${FIX}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
