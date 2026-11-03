#!/usr/bin/env node
/**
 * `pnpm lint:styles`: the style policy for the files Oxlint cannot parse (ADR 0114).
 * Oxlint `policy/no-arbitrary-styles` checks TypeScript; this script checks CSS and
 * `index.html`. Each result's CSS only imports `@repo/ui/styles.css` and lists
 * `@source` paths. `packages/ui/src/styles.css` alone holds the `@theme` block, and
 * no colour literal or Tailwind arbitrary value appears outside it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arbitraryClasses, colourLiterals } from '../tooling/oxlint-plugin-policy.js';

const THEME_FILE = 'packages/ui/src/styles.css';
const RESULT_CSS = ['apps/*/src/**/*.css', 'showcase/*/*/src/**/*.css'];
const PACKAGE_CSS = ['packages/*/src/**/*.css'];
const HTML = ['apps/web/index.html', 'showcase/*/web/index.html'];

const blank = (text) => text.replace(/[^\n]/g, ' ');
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const matchesAny = (path, globs) => globs.some((glob) => matchesGlob(path, glob));

/** Each match of `pattern` in `text`, with its line and the values `pick` finds in it. */
const findings = (text, pattern, pick) =>
  [...text.matchAll(pattern)].flatMap((match) =>
    pick(match).map((value) => ({ line: lineAt(text, match.index), value })),
  );

/** The `@theme { … }` blocks in a CSS text as `[start, end)` ranges. */
function themeBlocks(css) {
  return [...css.matchAll(/@theme\b[^{;]*\{/g)].map((match) => {
    const open = match.index + match[0].length;
    const close = [...css.slice(open)].reduce(
      (state, character, offset) => {
        if (state.end !== undefined) return state;
        const depth = state.depth + (character === '{') - (character === '}');
        return depth === 0 ? { depth, end: open + offset + 1 } : { depth, end: undefined };
      },
      { depth: 1, end: undefined },
    ).end;
    return [match.index, close ?? css.length];
  });
}

const maskRanges = (text, ranges) =>
  ranges.reduce(
    (masked, [start, end]) =>
      masked.slice(0, start) + blank(masked.slice(start, end)) + masked.slice(end),
    text,
  );

const colourProblems = (text) =>
  findings(text, /^.*$/gm, ([line]) => colourLiterals(line)).map(({ line, value }) => ({
    line,
    message: `colour literal \`${value}\`: use a @repo/ui colour token class`,
  }));

function cssProblems(path, css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const themes = themeBlocks(text);
  const misplacedThemes =
    path === THEME_FILE
      ? []
      : themes.map(([start]) => ({
          line: lineAt(text, start),
          message: `@theme block: the design tokens live only in ${THEME_FILE}`,
        }));
  const outsideTheme = maskRanges(text, themes);
  const applied = findings(outsideTheme, /@apply\s+([^;}]+)/g, (match) =>
    arbitraryClasses(match[1]),
  ).map(({ line, value }) => ({
    line,
    message: `Tailwind arbitrary value \`${value}\`: use a class on the theme scale`,
  }));
  const handWritten = matchesAny(path, RESULT_CSS)
    ? findings(
        outsideTheme.replace(/@(?:import|source)\b[^;{}]*;/g, blank),
        /\S[^\n]*/g,
        (match) => [match[0].trim()],
      )
        .slice(0, 1)
        .map(({ line, value }) => ({
          line,
          message: `hand-written CSS \`${value}\`: style with Tailwind classes; a result's CSS holds only @import and @source lines`,
        }))
    : [];
  return [...misplacedThemes, ...colourProblems(outsideTheme), ...applied, ...handWritten];
}

function htmlProblems(html) {
  const inline = findings(html, /\sstyle\s*=/gi, () => ['style']).map(({ line }) => ({
    line,
    message: 'inline style attribute: style with Tailwind classes',
  }));
  const classes = findings(html, /\sclass\s*=\s*(["'])(.*?)\1/gis, (match) =>
    arbitraryClasses(match[2]),
  ).map(({ line, value }) => ({
    line,
    message: `Tailwind arbitrary value \`${value}\`: use a class on the theme scale`,
  }));
  return [...inline, ...classes, ...colourProblems(html)];
}

/** Whether the style check reads this repository path. */
export const isStyleFile = (path) => matchesAny(path, [...RESULT_CSS, ...PACKAGE_CSS, ...HTML]);

/**
 * The style problems in the given files. Pure.
 *
 * @param {{ path: string, text: string }[]} files
 * @returns {{ path: string, line: number, message: string }[]}
 */
export function checkStyles(files) {
  return files
    .filter(({ path }) => isStyleFile(path))
    .flatMap(({ path, text }) =>
      (path.endsWith('.html') ? htmlProblems(text) : cssProblems(path, text)).map((problem) => ({
        path,
        ...problem,
      })),
    );
}

function runCli() {
  const paths = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.css', '*.html'],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(isStyleFile);
  const failures = checkStyles(paths.map((path) => ({ path, text: readFileSync(path, 'utf8') })));

  if (failures.length === 0) {
    console.log(`OK: ${paths.length} style files use only the @repo/ui design tokens.`);
    return;
  }

  console.error('Style policy violations (ADR 0114):\n');
  console.error(
    failures.map(({ path, line, message }) => `✗ ${path}:${line} ${message}`).join('\n'),
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
