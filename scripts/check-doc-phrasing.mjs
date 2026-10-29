#!/usr/bin/env node
/**
 * Guidance docs state rules as the action to take. A line that says what to
 * skip ("do not", "never", "avoid", a leading "No") fails, and the message asks
 * for the positive form.
 *
 * Code spans, fenced code, and link targets are ignored. ADRs are records that
 * are superseded, not edited, so they are out of scope, as are generated
 * reports and generated or vendored skills.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NEGATIVE_PHRASE =
  /\b(do not|don't|never|must not|mustn't|should not|shouldn't|cannot|can't|won't|avoid)\b/i;
const LEADING_NO = /^\s*(?:(?:[-*+]|\d+\.)\s+)?(?:\*\*)?(No)\s/;
const GUIDANCE_PREFIXES = ['.agents/', '.github/', 'docs/'];

// The show-me skill is vendored and pinned by hash in skills-lock.json.
const EXCLUDED_PREFIXES = ['.agents/decisions/', '.agents/skills/show-me/SKILL.md'];

/** True for the Markdown files that tell an agent or a person how to work here. */
export function isGuidanceDoc(path) {
  if (!path.endsWith('.md') || EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return !path.includes('/') || GUIDANCE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export const proseOf = (line) => line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');

/** The open fence marker after `line`: a fence closes only on the marker that opened it. */
export function nextFence(fence, line) {
  const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
  if (!marker) {
    return fence;
  }
  if (!fence) {
    return marker;
  }
  return marker.startsWith(fence) && line.trim() === marker ? '' : fence;
}

/**
 * Each `{ line, phrase }` where `text` phrases a rule as what to skip. Pure.
 *
 * @param {string} text Markdown source
 */
export function findNegativePhrasing(text) {
  let fence = '';
  return text.split('\n').flatMap((line, index) => {
    fence = nextFence(fence, line);

    const phrase = fence
      ? undefined
      : (proseOf(line).match(NEGATIVE_PHRASE) ?? line.match(LEADING_NO))?.[1];

    return phrase ? [{ line: index + 1, phrase }] : [];
  });
}

// Slop uses guidance scope minus trial records. ADRs and hash-pinned show-me are
// already excluded; trial fixtures and other non-guidance Markdown stay outside it.
export const isSlopDoc = (path) => isGuidanceDoc(path) && !path.startsWith('docs/trials/');

const SLOP =
  /—|\b(?:in order to|due to the fact that|at this point in time|in the event that|has the ability to|have the ability to|it is important to note|it's worth noting|it is worth noting|delve|tapestry|testament to|pivotal|seamless(?:ly)?|at its core|evolving landscape|let's dive|without further ado|I hope this helps)\b/gi;

/** Each `{ line, phrase }` containing an em dash or listed filler in prose. Pure. */
export function findSlop(text) {
  return text.split('\n').reduce(
    (state, line, index) => {
      const fence = nextFence(state.fence, line);
      const findings = fence
        ? []
        : Array.from(proseOf(line).matchAll(SLOP), (match) => ({
            line: index + 1,
            phrase: match[0],
          }));
      return { fence, findings: state.findings.concat(findings) };
    },
    { fence: '', findings: [] },
  ).findings;
}

function runCli() {
  const paths = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
    .split('\n')
    .filter(isGuidanceDoc);
  const failures = paths.flatMap((path) =>
    findNegativePhrasing(readFileSync(path, 'utf8')).map(
      ({ line, phrase }) => `  ✗ ${path}:${line} "${phrase}"`,
    ),
  );
  const slop = paths
    .filter(isSlopDoc)
    .flatMap((path) =>
      findSlop(readFileSync(path, 'utf8')).map(
        ({ line, phrase }) => `✗ ${path}:${line} "${phrase}"`,
      ),
    );
  if (slop.length > 0) {
    console.error(slop.join('\n'));
    console.error('use a comma, colon, period or parentheses; cut the filler');
    process.exitCode = 1;
  }
  if (failures.length === 0) {
    console.log(`OK: ${paths.length} guidance docs state their rules positively.`);
    return;
  }
  console.error('Guidance docs phrase these rules as what to skip:\n');
  console.error(failures.join('\n'));
  console.error(
    '\nRewrite each as the action to take, for example "Do not commit secrets" → ' +
      '"Keep secrets out of commits", or "No `any`" → "Use `unknown` and narrow".',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
