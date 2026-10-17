#!/usr/bin/env node
/**
 * A guidance doc that says a file needs enforcement sign-off names only files
 * the gate guards. The gate's own path rules in
 * `scripts/enforcement-approval.mjs` decide, so the docs follow the gate when
 * its path set changes (ADR 0023 narrowed it and left three docs behind).
 *
 * A claim is one sentence of a paragraph, list item, or heading, or one cell of
 * a table row. A claim whose prose mentions sign-off has each path-shaped code
 * span checked. A claim that a file changes with no sign-off, or sits outside
 * it, is the opposite claim, so it is skipped. A code span that is a link's
 * text is judged by the link's target.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isGuidanceDoc } from './check-doc-phrasing.mjs';
import * as gate from './enforcement-approval.mjs';

const SIGN_OFF = /\bsign[- ]?offs?\b/i;
const NO_SIGN_OFF = /\b(?:no|without|skips?|outside)\s+(?:\S+\s+){0,2}sign[- ]?offs?\b/i;
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z`[*])/;
const BLOCK_START = /^\s*(?:[-*+]\s|\d+\.\s|\||#)/;
const PATH_SPAN = /^(?=[^`]*[/.])[\w.\-/*]+$/;

const proseOf = (text) => text.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');

/** True when the gate asks for sign-off on a change to `path` (a file, folder, or glob). */
export function isGuardedPath(path) {
  const stripped = path.replace(/\*+$/, '');
  const filename = stripped.endsWith('/') ? `${stripped}example` : stripped;
  const file = { filename, status: 'modified', additions: 1, deletions: 0 };
  // Open PR #81 replaces `classifyProtectedFiles` with `guardedPaths`; either gate answers.
  const guarded =
    'guardedPaths' in gate ? gate.guardedPaths([file]) : gate.classifyProtectedFiles([file]);
  return guarded.length > 0;
}

/** The fence still open after `line`: a fence closes only on the marker that opened it. */
function nextFence(fence, line) {
  const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
  if (!marker) {
    return fence;
  }
  if (!fence) {
    return marker;
  }
  return marker.startsWith(fence) && line.trim() === marker ? '' : fence;
}

/** Each line of `markdown`, blanked when it is fenced code or a fence marker. */
function unfencedLines(markdown) {
  let fence = '';
  return markdown.split('\n').map((line) => {
    const open = fence;
    fence = nextFence(fence, line);
    return open || fence ? '' : line;
  });
}

/** The `{ line, text }` blocks of `markdown` outside fenced code. */
function blocksOf(markdown) {
  const blocks = [];
  for (const [index, line] of unfencedLines(markdown).entries()) {
    const current = blocks.at(-1);
    if (line.trim() === '') {
      blocks.push(undefined);
    } else if (current && !BLOCK_START.test(line)) {
      current.text += `\n${line}`;
    } else {
      blocks.push({ line: index + 1, text: line });
    }
  }
  return blocks.filter(Boolean);
}

/** The `{ line, text }` claims of `markdown`: table cells and sentences. */
function claimsOf(markdown) {
  return blocksOf(markdown).flatMap(({ line, text }) => {
    const parts = text.trimStart().startsWith('|')
      ? text.split(/(?<!\\)\|/)
      : text.split(SENTENCE_END);
    return parts.map((part) => ({ line, text: part }));
  });
}

/** The repo path a code span names: its link target when it is a link's text. */
function namedPath(span, target, docPath) {
  if (!target || /^[a-z]+:|^#/i.test(target)) {
    return span;
  }
  return posix.normalize(posix.join(posix.dirname(docPath), target.split('#')[0]));
}

/**
 * Each `{ line, path }` where the doc at `docPath` ties sign-off to a path the
 * gate leaves unguarded. Pure apart from the injected `isGuarded`.
 *
 * @param {string} markdown
 * @param {string} docPath repo-relative path of the doc, to resolve link targets
 * @param {(path: string) => boolean} [isGuarded]
 */
export function findUnguardedSignOffPaths(markdown, docPath, isGuarded = isGuardedPath) {
  return claimsOf(markdown).flatMap(({ line, text }) => {
    const prose = proseOf(text);
    if (!SIGN_OFF.test(prose) || NO_SIGN_OFF.test(prose)) {
      return [];
    }
    return [...text.matchAll(/`([^`\n]+)`(?:\]\(([^)\s]+)\))?/g)]
      .filter(([, span]) => PATH_SPAN.test(span))
      .map(([, span, target]) => namedPath(span, target, docPath))
      .filter((path) => !isGuarded(path))
      .map((path) => ({ line, path }));
  });
}

function runCli() {
  const paths = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
    .split('\n')
    .filter(isGuidanceDoc);
  const failures = paths.flatMap((path) =>
    findUnguardedSignOffPaths(readFileSync(path, 'utf8'), path).map(
      ({ line, path: named }) => `  ✗ ${path}:${line} \`${named}\``,
    ),
  );
  if (failures.length === 0) {
    console.log(`OK: ${paths.length} guidance docs tie sign-off only to guarded paths.`);
    return;
  }
  console.error(
    'These docs say a file needs enforcement sign-off, but the gate leaves it unguarded:\n',
  );
  console.error(failures.join('\n'));
  console.error(
    '\nName only the paths in `PROTECTED_PATH_RULES` (scripts/enforcement-approval.mjs), ' +
      'or link to the "Enforcement approval" section of .agents/project/QUALITY_GATES.md.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
