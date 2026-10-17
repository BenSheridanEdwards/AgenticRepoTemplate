#!/usr/bin/env node
/**
 * A guidance doc that says a file needs enforcement sign-off names only files
 * the gate guards. The gate's own path rules in `scripts/enforcement-approval.mjs`
 * decide, so the docs follow the gate when its path set changes (ADR 0030).
 *
 * A claim is one sentence or clause of a paragraph, list item, or heading, or one
 * cell of a table row. A claim whose prose mentions sign-off has each path-shaped
 * code span checked. A folder or glob is guarded when every tracked file it
 * covers is. A claim that a file needs no sign-off, goes without it, or sits
 * outside it passes. Markdown files and the gate's own script are references to
 * the gate, so they pass too.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isGuidanceDoc, nextFence, proseOf } from './check-doc-phrasing.mjs';
import * as gate from './enforcement-approval.mjs';

const SIGN_OFF = /\bsign(?:s|ed|ing)?(?:[- ]?offs?|\s+\w+\s+off)\b/i;
const NO_SIGN_OFF = /\b(?:no|without|skips?|outside)\s+(?:\S+\s+){0,2}sign[- ]?offs?\b/i;
const CLAIM_END = /(?<!\b(?:e\.g|i\.e|etc|vs)\.)(?<=[.!?])\s+(?=[A-Z`[*])|;\s+/;
const BLOCK_START = /^\s*(?:[-*+]\s|\d+\.\s|\||#)/;
const PATH_SPAN = /^(?=[^`]*[/.])[\w.\-/*]+$/;
const GATE_SCRIPT = 'scripts/enforcement-approval.mjs';

/** True when the gate asks for sign-off on a change to the file at `path`. */
function gateGuards(path) {
  const file = { filename: path, status: 'modified', additions: 1, deletions: 0 };
  // Open PR #81 replaces `classifyProtectedFiles` with `guardedPaths`; either gate answers.
  const guarded =
    'guardedPaths' in gate ? gate.guardedPaths([file]) : gate.classifyProtectedFiles([file]);
  return guarded.length > 0;
}

/** The tracked files a doc's `path` covers: the file itself, a folder's files, or a glob's matches. */
function coveredFiles(path, trackedFiles) {
  if (path.includes('*')) {
    const escapeRegExp = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const source = path
      .split('**')
      .map((part) => part.split('*').map(escapeRegExp).join('[^/]*'))
      .join('.*');
    const pattern = new RegExp(`^${source}$`);
    return trackedFiles.filter((file) => pattern.test(file));
  }
  const folder = path.endsWith('/') ? path : `${path}/`;
  return trackedFiles.filter((file) => file === path || file.startsWith(folder));
}

/**
 * True when a change to `path` (a file, folder, or glob, repo-relative) needs
 * sign-off: every tracked file it covers is guarded. A path that covers no
 * tracked file is judged as written, with a folder read as a file inside it.
 *
 * @param {string} path
 * @param {string[]} trackedFiles
 */
export function isGuardedPath(path, trackedFiles) {
  const covered = coveredFiles(path, trackedFiles);
  if (covered.length > 0) {
    return covered.every(gateGuards);
  }
  return gateGuards(path.endsWith('/') ? `${path}example` : path);
}

/** Each line of `markdown`, blanked inside fenced code and the generated GitNexus block. */
function proseLines(markdown) {
  let fence = '';
  let inGenerated = false;
  return markdown.split('\n').map((line) => {
    const open = fence;
    fence = nextFence(fence, line);
    const marker = /<!-- gitnexus:(start|end) -->/.test(line);
    inGenerated = marker ? !inGenerated : inGenerated;
    return open || fence || inGenerated || marker ? '' : line;
  });
}

/** The `{ line, text }` blocks of `markdown`: paragraphs, list items, table rows, headings. */
function blocksOf(markdown) {
  const blocks = [];
  for (const [index, line] of proseLines(markdown).entries()) {
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

/** The `{ line, text }` claims of `markdown`: table cells, sentences, and clauses. */
function claimsOf(markdown) {
  return blocksOf(markdown).flatMap(({ line, text }) => {
    const separator = text.trimStart().startsWith('|') ? /(?<!\\)\|/ : CLAIM_END;
    let position = 0;
    return text.split(separator).map((part) => {
      position = text.indexOf(part, position);
      const claim = { line: line + text.slice(0, position).split('\n').length - 1, text: part };
      position += part.length;
      return claim;
    });
  });
}

/** The repo path a code span names: its link target when it is a link's text. */
function namedPath(span, target, docPath) {
  if (!target || /^[a-z]+:|^#/i.test(target)) {
    return posix.normalize(span);
  }
  const file = target.split('#')[0];
  return file.startsWith('/')
    ? posix.normalize(file.slice(1))
    : posix.normalize(posix.join(posix.dirname(docPath), file));
}

const isGateReference = (path) => path.endsWith('.md') || path === GATE_SCRIPT;

/**
 * Each `{ line, path }` where the doc at `docPath` ties sign-off to a path the
 * gate leaves unguarded. Pure apart from the gate's path rules.
 *
 * @param {string} markdown
 * @param {string} docPath repo-relative path of the doc, to resolve link targets
 * @param {string[]} trackedFiles repo-relative tracked files, to expand folders and globs
 */
export function findUnguardedSignOffPaths(markdown, docPath, trackedFiles) {
  return claimsOf(markdown).flatMap(({ line, text }) => {
    const prose = proseOf(text);
    if (!SIGN_OFF.test(prose) || NO_SIGN_OFF.test(prose)) {
      return [];
    }
    return [...text.matchAll(/`([^`\n]+)`(?:\]\(([^)\s]+)\))?/g)]
      .map(([, span, target]) => namedPath(span, target, docPath))
      .filter((path) => PATH_SPAN.test(path) && !isGateReference(path))
      .filter((path) => !isGuardedPath(path, trackedFiles))
      .map((path) => ({ line, path }));
  });
}

function runCli() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const docs = trackedFiles.filter(isGuidanceDoc);
  const failures = docs.flatMap((doc) =>
    findUnguardedSignOffPaths(readFileSync(join(root, doc), 'utf8'), doc, trackedFiles).map(
      ({ line, path }) => `  ✗ ${doc}:${line} \`${path}\``,
    ),
  );
  if (failures.length === 0) {
    console.log(`OK: ${docs.length} guidance docs tie sign-off only to guarded paths.`);
    return;
  }
  console.error(
    'These docs say a file needs enforcement sign-off, but the gate leaves it unguarded:\n',
  );
  console.error(failures.join('\n'));
  console.error(
    `\nName only the paths the gate guards (${GATE_SCRIPT}), or link to the ` +
      '"Enforcement approval" section of .agents/project/QUALITY_GATES.md.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
