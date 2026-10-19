#!/usr/bin/env node
/**
 * Each PRD in `docs/prd/` states a feature's intent, and each behaviour it
 * lists names the E2E test that proves it (ADR 0045). The specs stay the
 * contract (ADR 0003), so this check fails on a conflict between the two: a PRD
 * with no behaviours, a behaviour that names no test, a line under
 * `## Behaviours` it cannot read, or a `Proved by` link to a spec file or test
 * title that does not exist.
 *
 * A behaviour is a top-level `- ` item under `## Behaviours`. Its proofs are
 * nested items of the form `- Proved by [<test title>](<path to the spec>)`,
 * with the path relative to the PRD and any `#` anchor ignored. A test counts
 * when its spec is a tracked `web/e2e/**\/*.spec.ts` file and a
 * `test('<title>', ...)` call in it has that exact literal title and runs: the
 * spec is parsed, so a test in a comment, a `test.skip`, `test.fixme` or
 * `test.fail`, a test inside `test.describe.skip` or `test.describe.fixme`, and
 * a test in a test, group or file that calls `test.skip(...)`, `test.fixme(...)`
 * or `test.fail(...)` without a test body, or `testInfo.skip(...)`,
 * `testInfo.fixme(...)` or `testInfo.fail(...)`, prove nothing. A `test.fail`
 * test passes only while its assertions fail.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { matchesGlob, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const PRD_GLOB = 'docs/prd/*.md';
const SPEC_GLOB = '**/web/e2e/**/*.spec.ts';
const BEHAVIOURS_HEADING = /^## Behaviours\s*$/;
const BEHAVIOUR = /^[-*] (.*)$/;
const PROOF = /^(?:\t| {2})\s*[-*] Proved by \[(.+)\]\(([^)\s<>]+)\)\s*$/;
const UNREAD_LINE = /^ ?(?:[-*+]|\d+[.)])\s|^\s+(?:(?:[-*+]|\d+[.)])\s+)?Proved by\b/;

/**
 * What each Playwright call declares, by its whole callee. A `test` is a test
 * that runs (`.only` runs too; CI's `forbidOnly` owns the focus rule), and a
 * `group` holds tests.
 */
const CALL_ROLES = new Map([
  ['test', 'test'],
  ['test.only', 'test'],
  ['test.describe', 'group'],
  ['test.describe.only', 'group'],
  ['test.describe.serial', 'group'],
  ['test.describe.serial.only', 'group'],
  ['test.describe.parallel', 'group'],
  ['test.describe.parallel.only', 'group'],
]);

/**
 * What any other method call declares, by its name alone. A `skip` with a
 * test body declares a test or group that proves nothing, whatever its title,
 * as `test.fail(title, body)` or `test.describe.skip` does. Without one, as in
 * `test.skip()` or `testInfo.fail()` whatever the parameter is called, no test
 * in the test, group or file it sits in proves anything. A matching call on
 * another object errs towards a false conflict, never a silent pass.
 */
const METHOD_ROLES = new Map([
  ['skip', 'skip'],
  ['fixme', 'skip'],
  ['fail', 'skip'],
]);

/**
 * The filesystem port: the tracked files present in the working tree, and file
 * text, by repository-relative path.
 */
export function createNodeFilesystem(rootDirectory) {
  return {
    listTrackedFiles: () =>
      execFileSync('git', ['ls-files', '-z'], { cwd: rootDirectory, encoding: 'utf8' })
        .split('\0')
        .filter((path) => path && existsSync(resolve(rootDirectory, path))),
    readText: (path) => readFileSync(resolve(rootDirectory, path), 'utf8'),
  };
}

/** The numbered lines of the first `## Behaviours` section, up to the next heading. */
function behavioursSection(lines) {
  const start = lines.findIndex(({ line }) => BEHAVIOURS_HEADING.test(line));
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(({ line }) => /^#{1,2} /.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The behaviours a PRD lists, with their proofs, and the lines it cannot read. */
function parseBehaviours(prdPath, text) {
  const lines = text.split(/\r?\n/).map((line, index) => ({ line, number: index + 1 }));
  const behaviours = [];
  const unread = lines.filter(({ line }) => BEHAVIOURS_HEADING.test(line)).slice(1);
  for (const { line, number } of behavioursSection(lines)) {
    const item = BEHAVIOUR.exec(line);
    const proof = PROOF.exec(line);
    if (item) {
      const summary = /^\*\*(.+?)\*\*/.exec(item[1])?.[1] ?? item[1];
      behaviours.push({ line: number, summary, proofs: [] });
    } else if (proof && behaviours.length > 0) {
      const spec = posix.join(posix.dirname(prdPath), proof[2].replace(/#.*$/, ''));
      behaviours.at(-1).proofs.push({ line: number, title: proof[1], spec });
    } else if (UNREAD_LINE.test(line)) {
      unread.push({ line, number });
    }
  }
  return { behaviours, unread };
}

/** `test.describe.skip` for a callee written that way, or undefined for any other. */
function calleeName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const object = calleeName(expression.expression);
    return object && `${object}.${expression.name.text}`;
  }
  return undefined;
}

/** The role of a call: by its whole callee, or else by its method name. */
function callRole({ expression }) {
  const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
  return CALL_ROLES.get(calleeName(expression)) ?? METHOD_ROLES.get(method);
}

/** Whether a call ends in a test body after a title, as in `test.skip(title, body)`. */
function hasTestBody(call) {
  return call.arguments.length >= 2 && ts.isFunctionLike(call.arguments.at(-1));
}

/** The literal title a call passes first, or undefined for a computed one. */
function literalTitle(call) {
  const [first] = call.arguments;
  return first && ts.isStringLiteralLike(first) ? first.text : undefined;
}

/**
 * The titles of the tests in a spec that run. Each test, group and the file
 * is a scope, and a test runs when no scope around it is skipped.
 */
function runningTestTitles(specPath, specText) {
  const file = ts.createSourceFile(specPath, specText, ts.ScriptTarget.Latest, true);
  const tests = [];
  const skipped = new Set();
  const visit = (node, scopes) => {
    const role = ts.isCallExpression(node) ? callRole(node) : undefined;
    const declares = role !== undefined && (role !== 'skip' || hasTestBody(node));
    const inner = declares ? [...scopes, node] : scopes;
    if (role === 'skip') {
      skipped.add(inner.at(-1));
    }
    if (role === 'test') {
      tests.push({ title: literalTitle(node), scopes: inner });
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(file, [file]);
  return new Set(
    tests
      .filter(
        ({ title, scopes }) => title !== undefined && !scopes.some((scope) => skipped.has(scope)),
      )
      .map(({ title }) => title),
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
  if (!runningTestTitles(spec, readText(spec)).has(title)) {
    return [
      `${prdPath}:${line} names "${title}", but \`${spec}\` has no test with that title. ` +
        'Match the title exactly, or update the PRD to the test that proves the behaviour now.',
    ];
  }
  return [];
}

/** The conflicts in one PRD: no behaviours, an unread line, a behaviour with no proof, or a broken proof. */
function prdConflicts(prdPath, filesystem, specs) {
  const { behaviours, unread } = parseBehaviours(prdPath, filesystem.readText(prdPath));
  const unreadConflicts = unread.map(({ line, number }) =>
    BEHAVIOURS_HEADING.test(line)
      ? `${prdPath}:${number} starts a second \`## Behaviours\` section. Merge it into the first.`
      : `${prdPath}:${number} is a line under \`## Behaviours\` the check cannot read. Write each ` +
        'behaviour as a top-level `- ` item and each proof as a nested ' +
        '`- Proved by [<test title>](<path to the spec>)` item under it.',
  );
  if (behaviours.length === 0) {
    return [
      `${prdPath} lists no behaviours. Add a \`## Behaviours\` section with one list item ` +
        'per behaviour the feature promises.',
      ...unreadConflicts,
    ];
  }
  return unreadConflicts.concat(
    behaviours.flatMap(({ line, summary, proofs }) => [
      ...(proofs.length === 0
        ? [
            `${prdPath}:${line} "${summary}" names no E2E test. Add a nested ` +
              '`- Proved by [<test title>](<path to the spec>)` item, writing the test first if it is missing.',
          ]
        : []),
      ...proofs.flatMap((proof) => proofConflicts(prdPath, proof, specs, filesystem.readText)),
    ]),
  );
}

/** Every conflict between the PRDs and the specs they link, as one message each. */
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
