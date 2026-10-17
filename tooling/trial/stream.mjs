/**
 * Reads a `claude --output-format stream-json` transcript: the summary the
 * evidence records, and the paths the agent's tool calls named outside its
 * clone (ADR 0034). Event names may change between CLI versions, so every
 * reader here tolerates a missing field and reports null instead.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A path word in a shell command: absolute, under `~/`, or relative with a
 * leading `..`, after a space, a quote, `=`, `<`, `>` or `(`. A word starts
 * with a name character after its first `/`, so `//` comments are not words.
 */
const SHELL_PATH = /(?:^|[\s'"=<>(])((?:~|\.\.)?\/[\w.~-][^\s'"`;|&<>(){}$,]*|\.\.(?=$|[\s;|&)]))/g;

/** System folders, which hold no repository, so a tool may name them. */
const SYSTEM_ROOTS = ['/dev', '/proc', '/sys', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc'];

/** Each JSON line of a transcript; a line that is not a JSON object is skipped. */
export function streamEvents(text) {
  return text.split('\n').flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event === 'object' ? [event] : [];
    } catch {
      return [];
    }
  });
}

/** A user event that carries text, as a prompt does, rather than only tool results. */
const isUserText = (event) => {
  const content = event.type === 'user' ? event.message?.content : undefined;
  return (
    typeof content === 'string' ||
    (Array.isArray(content) && content.some((block) => block?.type === 'text'))
  );
};

/**
 * The resolved model, turns and cost, or null for a field the stream does not
 * carry, and how many user events carry text.
 */
export function summarizeStream(events) {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
  const result = events.findLast((event) => event.type === 'result');
  const numberOrNull = (value) => (typeof value === 'number' ? value : null);
  return {
    resolvedModel: typeof init?.model === 'string' ? init.model : null,
    turns: numberOrNull(result?.num_turns),
    costUsd: numberOrNull(result?.total_cost_usd),
    userTextEvents: events.filter(isUserText).length,
  };
}

/** A variable whose value is a credential, by its name. */
const SECRET_NAME = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH/i;

/**
 * `text` with the value of every secret-named variable in `env` replaced by
 * `[redacted <NAME>]`, longest value first, so the stream can be committed.
 *
 * @param {string} text
 * @param {NodeJS.ProcessEnv} env
 */
export function redactSecrets(text, env) {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value && value.length >= 8)
    .sort(([, left], [, right]) => right.length - left.length)
    .reduce((redacted, [name, value]) => redacted.replaceAll(value, `[redacted ${name}]`), text);
}

const toolInputs = (events) =>
  events.flatMap((event) =>
    (Array.isArray(event.message?.content) ? event.message.content : [])
      .filter(
        (block) => block?.type === 'tool_use' && block.input && typeof block.input === 'object',
      )
      .map((block) => block.input),
  );

const expandHome = (path) => (path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);

/**
 * Paths the agent's tool calls named outside `allowedRoots` (the trial's own
 * workdir, the config entries the agent loads, the pnpm store) and the system
 * folders. A file or search tool's path argument always counts, so a search
 * rooted at an ancestor of the workdir shows. A shell word counts only when it
 * exists on disk, because shell text also holds URL paths (`/trpc`) and
 * markup. Relative words resolve from the clone, where every shell starts.
 *
 * @param {readonly object[]} events
 * @param {{ clone: string, allowedRoots: readonly string[] }} scope
 */
export function findOutsideReads(events, { clone, allowedRoots }) {
  const allowed = (path) =>
    [...allowedRoots, ...SYSTEM_ROOTS].some((root) => {
      const base = root.replace(/\/$/, '');
      return path === base || path.startsWith(`${base}/`);
    });
  const inputs = toolInputs(events);
  const fromFileTools = inputs
    .flatMap((input) => [input.file_path, input.path, input.notebook_path])
    .filter((path) => typeof path === 'string')
    .map((path) => resolve(clone, expandHome(path)));
  const fromShell = inputs
    .flatMap((input) =>
      typeof input.command === 'string'
        ? [...input.command.matchAll(SHELL_PATH)].map((match) => match[1])
        : [],
    )
    .map((path) => resolve(clone, expandHome(path)))
    .filter((path) => existsSync(path));
  return [...new Set([...fromFileTools, ...fromShell])].filter((path) => !allowed(path)).sort();
}
