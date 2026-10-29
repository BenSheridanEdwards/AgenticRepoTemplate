/**
 * Reads a `claude --output-format stream-json` transcript: the summary the
 * evidence records, and the paths the agent's tool calls named outside its
 * clone (ADR 0034). Event names may change between CLI versions, so every
 * reader here tolerates a missing field and reports null instead.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
export function summarizeStream(events, agent = 'claude', options = {}) {
  if (agent === 'codex') return summarizeCodex(events, options);
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

/**
 * The input object of every tool call in `events`.
 *
 * @param {unknown[]} events
 */
export const toolInputs = (events) =>
  events.flatMap((event) => {
    const item = event.item;
    const codex =
      item?.type === 'command_execution' && typeof item.command === 'string'
        ? [{ command: unwrapCommand(item.command) }]
        : item?.type === 'file_change'
          ? (item.changes ?? []).map(({ path }) => ({ file_path: path }))
          : [];
    return [
      ...codex,
      ...(Array.isArray(event.message?.content) ? event.message.content : [])
        .filter(
          (block) => block?.type === 'tool_use' && block.input && typeof block.input === 'object',
        )
        .map((block) => block.input),
    ];
  });

/** Undo the shell's single-quoted argv representation, leaving the actual script. */
export function unwrapCommand(command) {
  const wrapped = command.match(/^\/bin\/(?:ba)?sh -lc '([\s\S]*)'$/);
  return wrapped ? wrapped[1].replaceAll("'\\''", "'") : command;
}

/** Find only this thread's transcript; credentials never enter the reader. */
function codexTranscript(home, threadId) {
  if (!threadId || !/^[a-zA-Z0-9-]+$/.test(threadId)) return null;
  const walk = (folder, depth) => {
    if (!existsSync(folder)) return [];
    return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() && depth > 0
        ? walk(join(folder, entry.name), depth - 1)
        : entry.isFile() && entry.name.endsWith(`-${threadId}.jsonl`)
          ? [join(folder, entry.name)]
          : [],
    );
  };
  return walk(join(home, 'sessions'), 3).sort().at(-1) ?? null;
}

function tokenUsageOf(completed) {
  const tokenUsage = completed.length
    ? completed.reduce(
        (total, event) => {
          const entries = [];
          for (const [key, value] of Object.entries(total))
            entries.push([key, value + (event.usage?.[key] ?? 0)]);
          return Object.fromEntries(entries);
        },
        { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
      )
    : null;
  return tokenUsage;
}

function codexModel(transcriptPath) {
  const contexts = transcriptPath
    ? streamEvents(readFileSync(transcriptPath, 'utf8'))
        .filter((event) => event.type === 'turn_context')
        .map((event) => event.payload)
    : [];
  const context = contexts.findLast((entry) => typeof entry?.model === 'string');
  return {
    resolvedModel: context?.model ?? 'gpt-6.1-sol',
    modelSource: context ? 'transcript' : 'pinned',
    reasoningEffort: context?.effort ?? context?.reasoning_effort ?? null,
  };
}

function summarizeCodex(events, { codexHome = join(homedir(), '.codex') }) {
  const sessionId = events.find((event) => event.type === 'thread.started')?.thread_id ?? null;
  const transcriptPath = codexTranscript(codexHome, sessionId);
  const completed = events.filter((event) => event.type === 'turn.completed');
  return {
    sessionId,
    transcriptPath,
    ...codexModel(transcriptPath),
    turns: completed.length,
    costUsd: null,
    tokenUsage: tokenUsageOf(completed),
    userTextEvents: events.filter((event) => event.item?.type === 'user_message').length,
  };
}

const expandHome = (path) => (path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);

/** A `cd` at the start of a command, maybe inside `(`, and its target word. */
const CD = /^\s*\(?\s*cd(?:\s+([^\s;|&)]+))?\s*(?:$|[\s)])/;

/**
 * Where a `cd` lands from `cwd`: home for a bare `cd`, null for a target
 * built at run time or `cd -`, so later relative words are not resolved.
 */
function cdTarget(word, cwd) {
  const target = word?.replace(/^(['"])(.*)\1$/, '$2');
  if (target === undefined || target === '~') {
    return homedir();
  }
  if (target === '-' || /[$`]/.test(target) || (cwd === null && !/^[~/]/.test(target))) {
    return null;
  }
  return resolve(cwd ?? '/', expandHome(target));
}

/**
 * The path words of each shell command, resolved in order from the folder the
 * Bash tool is in. That folder starts at the clone and persists between calls
 * while it is inside the clone; Claude Code moves it back to the clone after a
 * call that leaves. A `cd` inside `( )` lasts until the `)`. A relative word
 * after a `cd` that cannot be followed is left out.
 */
function shellWords(commands, clone) {
  let cwd = clone;
  return commands.flatMap((command) => {
    const subshells = [];
    const named = command.split(/&&|\|\||[;|\n]/).flatMap((segment) => {
      if (segment.trimStart().startsWith('(')) {
        subshells.push(cwd);
      }
      const words = [...segment.matchAll(SHELL_PATH)]
        .map((match) => expandHome(match[1]))
        .filter((word) => word.startsWith('/') || cwd !== null)
        .map((word) => resolve(cwd ?? '/', word));
      const cd = segment.match(CD);
      if (cd) {
        cwd = cdTarget(cd[1], cwd);
      }
      if (subshells.length > 0 && segment.trimEnd().endsWith(')')) {
        cwd = subshells.pop();
      }
      return words;
    });
    if (cwd !== null && cwd !== clone && !cwd.startsWith(`${clone}/`)) {
      cwd = clone;
    }
    return named;
  });
}

/**
 * Paths the agent's tool calls named outside its scope, and outside the
 * system folders. A path is in scope when the closest root holding it is in
 * `allowedRoots`, so a denied root (the trials root, other transcripts) wins
 * over an allowed root that holds it and loses to an allowed root inside it
 * (the trial's own workdir, its own session folders). A file or search tool's
 * path argument always counts, so a search rooted at an ancestor of the
 * workdir shows. A shell word counts only when it exists on disk, because
 * shell text also holds URL paths (`/trpc`) and markup.
 *
 * @param {readonly object[]} events
 * @param {{ clone: string, allowedRoots: readonly string[], deniedRoots: readonly string[] }} scope
 */
export function findOutsideReads(events, { clone, allowedRoots, deniedRoots }) {
  const roots = [
    ...[...allowedRoots, ...SYSTEM_ROOTS].map((root) => ({ root, allowed: true })),
    ...deniedRoots.map((root) => ({ root, allowed: false })),
  ].map(({ root, allowed }) => ({ root: root.replace(/\/$/, ''), allowed }));
  const allowed = (path) =>
    roots
      .filter(({ root }) => path === root || path.startsWith(`${root}/`))
      .sort(
        (left, right) =>
          right.root.length - left.root.length || Number(left.allowed) - Number(right.allowed),
      )[0]?.allowed === true;
  const inputs = toolInputs(events);
  const fromFileTools = inputs
    .flatMap((input) => [input.file_path, input.path, input.notebook_path])
    .filter((path) => typeof path === 'string')
    .map((path) => resolve(clone, expandHome(path)));
  const fromShell = shellWords(
    inputs.map((input) => input.command).filter((command) => typeof command === 'string'),
    clone,
  ).filter((path) => existsSync(path));
  return [...new Set([...fromFileTools, ...fromShell])].filter((path) => !allowed(path)).sort();
}
