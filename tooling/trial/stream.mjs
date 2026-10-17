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
 * An absolute path word in a shell command: after a space, a quote, `=`,
 * `<`, `>` or `(`, and starting with a name character, so `//` comments and
 * `</div>` tags are not words.
 */
const SHELL_PATH = /(?:^|[\s'"=<>(])(~?\/[\w.~-][^\s'"`;|&<>(){}$,]*)/g;

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

/** The resolved model, turns and cost, or null for a field the stream does not carry. */
export function summarizeStream(events) {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
  const result = events.findLast((event) => event.type === 'result');
  const numberOrNull = (value) => (typeof value === 'number' ? value : null);
  return {
    resolvedModel: typeof init?.model === 'string' ? init.model : null,
    turns: numberOrNull(result?.num_turns),
    costUsd: numberOrNull(result?.total_cost_usd),
  };
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
 * Paths the agent's tool calls named inside `deniedRoots`, the places where an
 * earlier result can live (the checkout that keeps the evidence, the trials
 * root, Claude's session transcripts), unless they sit inside `allowedRoots`
 * (the trial's own workdir, the config the agent loads). A file tool's path
 * argument always counts. A shell word counts only when it exists on disk,
 * because shell text also holds URL paths (`/trpc`) and markup. Relative
 * shell paths are not read: a `cd ..` escape is outside what this can see.
 *
 * @param {readonly object[]} events
 * @param {{ clone: string, deniedRoots: readonly string[], allowedRoots: readonly string[] }} scope
 */
export function findOutsideReads(events, { clone, deniedRoots, allowedRoots }) {
  const within = (roots) => (path) =>
    roots.some((root) => {
      const base = root.replace(/\/$/, '');
      return path === base || path.startsWith(`${base}/`);
    });
  const denied = within(deniedRoots);
  const allowed = within([clone, ...allowedRoots]);
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
  return [...new Set([...fromFileTools, ...fromShell])]
    .filter((path) => denied(path) && !allowed(path))
    .sort();
}
