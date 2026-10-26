#!/usr/bin/env node
/**
 * Fallow evidence (ADR 0068). --collect reads CHANGED (newline paths), HEAD_SHA,
 * and OUT (default: blast-radius.json). Failures exit non-zero without evidence.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const unique = (paths) => [...new Set(paths)].toSorted();
const isPath = (value) => typeof value === 'string' && value.length > 0;
const isPaths = (value) => Array.isArray(value) && value.every(isPath);

export const BLAST_RADIUS_THRESHOLD = 20;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safePath = (value) =>
  isPath(value) &&
  value.length <= 300 &&
  !value.startsWith('/') &&
  !value.split('/').includes('..') &&
  !value.includes('`') &&
  !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
const safePaths = (value) => Array.isArray(value) && value.every(safePath);
const isSubset = (subset, values) => {
  const paths = new Set(values);
  return subset.every((path) => paths.has(path));
};
const validFile = (file) =>
  safePath(file?.path) &&
  typeof file.inGraph === 'boolean' &&
  safePaths(file.importers) &&
  safePaths(file.consumers) &&
  isSubset(file.consumers, file.importers) &&
  (file.inGraph || file.importers.length === 0);
const validZones = (zones) =>
  isObject(zones) &&
  Object.entries(zones).every(
    ([path, zone]) => safePath(path) && (zone === null || safePath(zone)),
  );
const validEvidence = (evidence) =>
  evidence?.version === 1 &&
  Array.isArray(evidence.files) &&
  evidence.files.every(validFile) &&
  validZones(evidence.zones);

/** Validate untrusted JSON without loading anything from the PR checkout. */
export function parseBlastRadius(text, { head, changed }) {
  try {
    const evidence = JSON.parse(text);
    if (typeof head !== 'string' || !head || !validEvidence(evidence) || evidence.head !== head)
      return undefined;
    const paths = evidence.files.map((file) => file.path);
    const complete =
      isSubset(changed, paths) &&
      new Set(paths).size === paths.length &&
      evidence.files.every((file) =>
        [file.path, ...file.importers].every((path) => Object.hasOwn(evidence.zones, path)),
      );
    const changedPaths = new Set(changed);
    return complete
      ? { ...evidence, files: evidence.files.filter((file) => changedPaths.has(file.path)) }
      : undefined;
  } catch {
    return undefined;
  }
}

export function unitOf(path) {
  const [root, name] = path.split('/');
  if (root === 'apps') return 'apps';
  return (root === 'packages' || root === 'showcase') && name ? `${root}/${name}` : 'root';
}

export function blastRadiusGaps(evidence) {
  const changed = new Set(evidence.files.map((file) => file.path));
  const files = evidence.files.map((file) => ({
    ...file,
    importers: file.importers.filter((path) => !changed.has(path)),
  }));
  const importers = unique(files.flatMap((file) => file.importers));
  const gaps = files.flatMap((file) => {
    const others = unique(file.importers.map(unitOf).filter((unit) => unit !== unitOf(file.path)));
    return others.length
      ? [
          `The changed file \`${file.path}\` reaches other units: ${others.map((unit) => `\`${unit}\``).join(', ')}.`,
        ]
      : [];
  });
  return {
    gaps: [
      ...gaps,
      ...(importers.length > BLAST_RADIUS_THRESHOLD
        ? [
            `Blast radius reaches ${importers.length} distinct importers, above ${BLAST_RADIUS_THRESHOLD}.`,
          ]
        : []),
    ],
    summary: {
      count: importers.length,
      units: unique(importers.map(unitOf)),
      zones: unique(importers.map((path) => evidence.zones[path] ?? '(none)')),
      topImporters: unique(
        files.flatMap((file) => {
          const importers = new Set(file.importers);
          return file.consumers.filter((path) => importers.has(path));
        }),
      ).slice(0, 10),
    },
  };
}

export function renderBlastRadius(summary) {
  const list = (values) => values.map((value) => `\`${value}\``).join(', ') || '(none)';
  return [
    '### Import blast radius',
    '',
    `- Distinct importers: ${summary.count}`,
    `- Units: ${list(summary.units)}`,
    `- Fallow zones: ${list(summary.zones)}`,
    `- Top importers: ${list(summary.topImporters)}`,
    '',
  ];
}

const isClosure = (value, path) =>
  value?.kind === 'trace' &&
  !value.error &&
  value.seed === path &&
  isPaths(value.affected_not_shown) &&
  Array.isArray(value.coordination_gap) &&
  value.coordination_gap.every((consumer) => isPath(consumer?.consumer_file));

function readClosure(path, closure) {
  if (
    closure?.error === true &&
    closure.exit_code === 2 &&
    closure.message === `file '${path}' not found in module graph`
  ) {
    return { path, inGraph: false, importers: [], consumers: [] };
  }
  if (!isClosure(closure, path)) {
    throw new Error(
      `Invalid Fallow closure for ${path}: ${closure?.message ?? 'unexpected shape'}`,
    );
  }
  return {
    path,
    inGraph: true,
    importers: closure.affected_not_shown,
    consumers: closure.coordination_gap.map((consumer) => consumer.consumer_file),
  };
}

/** Preserve each seed's reach; the consumer unions it when grading the PR. */
export function shapeBlastRadius({ head, changed, closures, guard, tracked }) {
  const changedPaths = new Set(changed);
  const keep = (path) => tracked.has(path) && !changedPaths.has(path);
  const files = unique(changed).map((path) => {
    const closure = readClosure(path, closures[path]);
    const importers = unique(closure.importers.filter(keep));
    return {
      ...closure,
      importers,
      consumers: unique(closure.consumers.filter((file) => importers.includes(file))),
    };
  });
  const paths = unique([...changed, ...files.flatMap((file) => file.importers)]);
  if (
    guard?.kind !== 'guard' ||
    !Array.isArray(guard.files) ||
    !guard.files.every(
      (file) => isPath(file?.path) && (file.zone === null || isPath(file.zone?.name)),
    )
  ) {
    throw new Error('Invalid Fallow guard: unexpected shape');
  }
  const zones = new Map(guard.files.map((file) => [file.path, file.zone?.name ?? null]));
  if (paths.some((path) => !zones.has(path))) throw new Error('Incomplete Fallow guard zones');
  return {
    version: 1,
    head,
    files,
    zones: Object.fromEntries(paths.map((path) => [path, zones.get(path)])),
  };
}

function run(command, args, statuses = [0]) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || !statuses.includes(result.status)) {
    throw new Error(
      `${command} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`,
    );
  }
  return result.stdout;
}

function fallow(args, statuses) {
  return JSON.parse(
    run('pnpm', ['exec', 'fallow', ...args, '--format', 'json', '--quiet'], statuses),
  );
}

function collect() {
  const output = process.env.OUT ?? 'blast-radius.json';
  rmSync(output, { force: true });
  if (process.env.CHANGED === undefined)
    throw new Error('CHANGED is required (newline-separated paths)');
  if (!process.env.HEAD_SHA?.trim()) throw new Error('HEAD_SHA is required');
  const changed = unique(process.env.CHANGED.split('\n').filter(Boolean));
  const tracked = new Set(run('git', ['ls-files', '-z']).split('\0').filter(Boolean));
  const closures = Object.fromEntries(
    changed.map((path) => [path, fallow(['dead-code', '--impact-closure', path], [0, 2])]),
  );
  const paths = unique([
    ...changed,
    ...changed.flatMap((path) =>
      readClosure(path, closures[path]).importers.filter((file) => tracked.has(file)),
    ),
  ]);
  const guard = paths.length ? fallow(['guard', ...paths]) : { kind: 'guard', files: [] };
  const evidence = shapeBlastRadius({
    head: process.env.HEAD_SHA,
    changed,
    closures,
    guard,
    tracked,
  });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (!process.argv.includes('--collect')) throw new Error('Usage: blast-radius.mjs --collect');
    collect();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
