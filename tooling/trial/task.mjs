/** Task files are boundary data; reject typos before creating a workdir. */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { validators } from './evidence.mjs';

const { shape, text, list, oneOf, nullable } = validators;
const optional = (check) => Object.assign((value, path) => check(value, path), { optional: true });
const STRING = text(/^[\s\S]+$/, 'a nonempty string');
const PREFIX = text(
  /^(?!\/|:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^\\]+$/,
  'a repository-relative path prefix',
);
const COMMANDS = list(
  shape({
    name: STRING,
    argv: (value, path) => {
      list(STRING)(value, path);
      if (value.length === 0) throw new Error(`${path}: expected a nonempty command`);
    },
  }),
);
const TASK = shape({
  name: text(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a lowercase slug'),
  prompt: STRING,
  target: optional(
    nullable(shape({ repo: STRING, rev: text(/^[0-9a-f]{40}$/, 'a full 40-hex SHA') })),
  ),
  allowedPaths: list(PREFIX),
  resultPaths: optional(list(PREFIX)),
  setup: COMMANDS,
  checks: COMMANDS,
  acceptance: optional(COMMANDS),
  ports: optional(
    list((port, path) => {
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error(`${path}: expected a TCP port number`);
    }),
  ),
  enforcementPaths: optional(list(STRING)),
  commitMessage: optional(STRING),
  evidenceDir: optional((value, path) => {
    STRING(value, path);
    if (!isAbsolute(value)) throw new Error(`${path}: expected an absolute directory`);
  }),
  land: oneOf('showcase', 'patch'),
});

/** Validate without rewriting the caller's value. */
export function validateTask(value) {
  TASK(value, 'task');
  const names = [...value.checks, ...(value.acceptance ?? [])].map(({ name }) => name);
  if (new Set(names).size !== names.length)
    throw new Error('task.checks: expected unique check and acceptance names');
  if (value.target && value.land !== 'patch')
    throw new Error('task.land: expected patch for an external target');
  if (value.target && !value.evidenceDir)
    throw new Error('task.evidenceDir: required for an external target');
  return value;
}

export const TODO_TASK = validateTask(
  JSON.parse(readFileSync(new URL('./tasks/todo.json', import.meta.url), 'utf8')),
);

/** Built-in briefs read prompts at the scaffold; external tasks resolve their local paths. */
export function loadTask(path) {
  const taskFile = resolve(path);
  const task = validateTask(JSON.parse(readFileSync(taskFile, 'utf8')));
  const taskDir = dirname(taskFile);
  if (task.target && !/^[a-z][a-z0-9+.-]*:|^[^/]+@[^:]+:/i.test(task.target.repo))
    task.target.repo = resolve(taskDir, task.target.repo);
  return {
    task,
    taskDir,
    promptFile:
      !task.target && realpathSync(taskDir) === realpathSync(resolve(import.meta.dirname, 'tasks'))
        ? undefined
        : resolve(taskDir, task.prompt),
  };
}

/** Folder boundaries also allow an exact file path. */
export const withinPaths = (path, prefixes) =>
  prefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
  );
