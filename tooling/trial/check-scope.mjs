#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { inspectChanges, systemDeps } from './run-trial.mjs';
import { TODO_TASK } from './task.mjs';

try {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, scaffold: { type: 'string', default: 'origin/main' } },
  });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.id ?? ''))
    throw new Error('Pass --id <trial-id>, for example --id todo-01.');
  const lockfile = execFileSync('git', ['show', `${values.scaffold}:pnpm-lock.yaml`], {
    encoding: 'utf8',
  });
  const { outsideScope } = await inspectChanges(
    { id: values.id, clone: process.cwd(), scaffoldRev: values.scaffold, task: TODO_TASK },
    lockfile,
    systemDeps(),
  );
  if (outsideScope.length)
    throw new Error(
      `Restore changes outside showcase/${values.id}/: ${outsideScope.join(', ')}. Keep pnpm-lock.yaml edits only in showcase/${values.id}/{web,api} importers, then rerun this check.`,
    );
  console.log(`Scope passed for showcase/${values.id}/.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
