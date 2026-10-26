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
