#!/usr/bin/env node
/**
 * Each PRD in `docs/prd/` states a feature's intent, and each behaviour it
 * lists names the E2E test that proves it (ADR 0045). The specs stay the
 * contract (ADR 0003), so this check fails on a conflict between the two: a PRD
 * with no behaviours, a behaviour that names no test, or a `Proved by` link to
 * a spec file or test title that does not exist.
 *
 * A behaviour is a top-level list item under `## Behaviours`. Its proofs are
 * nested items of the form `- Proved by [<test title>](<path to the spec>)`,
 * with the path relative to the PRD. A test counts when its spec is a tracked
 * `web/e2e/**\/*.spec.ts` file and a `test('<title>', ...)` call in it has that
 * exact title; `test.skip` and `test.fixme` prove nothing, so they do not count.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { matchesGlob, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRD_GLOB = 'docs/prd/*.md';
const SPEC_GLOB = '**/web/e2e/**/*.spec.ts';
const BEHAVIOURS_HEADING = /^## Behaviours\s*$/;
const BEHAVIOUR = /^[-*] (.*)$/;
const PROOF = /^\s+[-*] Proved by \[(.+)\]\(([^)\s]+)\)\s*$/;
const TEST_TITLE = /\btest\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** The filesystem port: tracked files and file text, by repository-relative path. */
export function createNodeFilesystem(rootDirectory) {
  return {
    listTrackedFiles: () =>
      execFileSync('git', ['ls-files', '-z'], { cwd: rootDirectory, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean),
    readText: (path) => readFileSync(resolve(rootDirectory, path), 'utf8'),
  };
}

/** The numbered lines of the `## Behaviours` section, up to the next heading. */
function behavioursSection(text) {
  const lines = text.split(/\r?\n/).map((line, index) => ({ line, number: index + 1 }));
  const start = lines.findIndex(({ line }) => BEHAVIOURS_HEADING.test(line));
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(({ line }) => /^#{1,2} /.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The behaviours a PRD lists, each with its line, summary and proofs. */
function parseBehaviours(prdPath, text) {
  const behaviours = [];
  for (const { line, number } of behavioursSection(text)) {
    const item = BEHAVIOUR.exec(line);
    const proof = PROOF.exec(line);
    if (item) {
      const summary = /^\*\*(.+?)\*\*/.exec(item[1])?.[1] ?? item[1];
      behaviours.push({ line: number, summary, proofs: [] });
    } else if (proof && behaviours.length > 0) {
      const spec = posix.join(posix.dirname(prdPath), proof[2]);
      behaviours.at(-1).proofs.push({ line: number, title: proof[1], spec });
    }
  }
  return behaviours;
}

/** The titles of the `test(...)` calls in a spec's source. */
function testTitles(specText) {
  return new Set(
    [...specText.matchAll(TEST_TITLE)].map((match) => match[2].replace(/\\(.)/g, '$1')),
  );
}

/** The conflicts a `Proved by` link makes: a spec that is missing, or a title it lacks. */
function proofConflicts(prdPath, { line, title, spec }, specs, readText) {
  if (!specs.has(spec)) {
    return [
      `${prdPath}:${line} links \`${spec}\`, which is not a tracked E2E spec ` +
        `(\`${SPEC_GLOB}\`). Point the link at the spec that proves the behaviour.`,
    ];
  }
  if (!testTitles(readText(spec)).has(title)) {
    return [
      `${prdPath}:${line} names "${title}", but \`${spec}\` has no test with that title. ` +
        'Match the title exactly, or update the PRD to the test that proves the behaviour now.',
    ];
  }
  return [];
}

/** The conflicts in one PRD: no behaviours, a behaviour with no proof, or a broken proof. */
function prdConflicts(prdPath, filesystem, specs) {
  const behaviours = parseBehaviours(prdPath, filesystem.readText(prdPath));
  if (behaviours.length === 0) {
    return [
      `${prdPath} lists no behaviours. Add a \`## Behaviours\` section with one list item ` +
        'per behaviour the feature promises.',
    ];
  }
  return behaviours.flatMap(({ line, summary, proofs }) => [
    ...(proofs.length === 0
      ? [
          `${prdPath}:${line} "${summary}" names no E2E test. Add a nested ` +
            '`- Proved by [<test title>](<path to the spec>)` item, writing the test first if it is missing.',
        ]
      : []),
    ...proofs.flatMap((proof) => proofConflicts(prdPath, proof, specs, filesystem.readText)),
  ]);
}

/** Every conflict between the PRDs and the specs they link, as one message each. Pure. */
export function findPrdConflicts(filesystem) {
  const tracked = filesystem.listTrackedFiles();
  const specs = new Set(tracked.filter((path) => matchesGlob(path, SPEC_GLOB)));
  return tracked
    .filter((path) => matchesGlob(path, PRD_GLOB))
    .flatMap((prdPath) => prdConflicts(prdPath, filesystem, specs));
}

function runCli() {
  const filesystem = createNodeFilesystem(process.cwd());
  const conflicts = findPrdConflicts(filesystem);
  if (conflicts.length === 0) {
    const count = filesystem
      .listTrackedFiles()
      .filter((path) => matchesGlob(path, PRD_GLOB)).length;
    console.log(
      `OK: every behaviour in ${count} PRD${count === 1 ? '' : 's'} names an E2E test that exists.`,
    );
    return;
  }
  console.error('PRDs conflict with the behaviour map:\n');
  console.error(conflicts.map((conflict) => `  ✗ ${conflict}`).join('\n'));
  console.error(
    '\nSee ADR 0045 (`.agents/decisions/0045-prds-state-intent-and-link-their-specs.md`).',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
