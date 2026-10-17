/**
 * The trial harness's one door to the system: processes, disk, ports and the
 * environment each command gets (ADR 0034). `run-trial.mjs` takes these as
 * injected `Deps`, so its tests swap in fakes.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, statfsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Git's per-repository variables, which a hook exports and a child repository must not inherit. */
const GIT_LOCAL_ENV = (
  spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout ?? ''
)
  .split('\n')
  .filter(Boolean);

/** Variables pnpm sets for a script it runs, which point back at the invoking checkout. */
const PNPM_SCRIPT_ENV = /^(npm_|INIT_CWD$|PNPM_SCRIPT_SRC_DIR$)/;

/** The `CLAUDE*` variables an agent keeps: where its config lives and how it authenticates. */
const AGENT_KEEPS = new Set([
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);

/**
 * Every command's environment: the caller's, without git's per-repository
 * variables, pnpm's script variables or `node_modules/.bin` folders on the
 * PATH, so nothing points back at the invoking checkout.
 */
function commandEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !GIT_LOCAL_ENV.includes(name) && !PNPM_SCRIPT_ENV.test(name),
    ),
  );
  env.PATH = (env.PATH ?? '')
    .split(':')
    .filter((entry) => !entry.includes('/node_modules/.bin'))
    .join(':');
  env.COREPACK_HOME ??= join(homedir(), '.cache/node/corepack');
  return env;
}

/**
 * The agent's environment: without the variables a parent Claude Code session
 * sets, so a harness started inside a session still starts a fresh top-level
 * one, but with its config folder and credentials.
 */
export function agentEnv() {
  return Object.fromEntries(
    Object.entries(commandEnv()).filter(
      ([name]) => !name.startsWith('CLAUDE') || AGENT_KEEPS.has(name),
    ),
  );
}

/** The checks' environment: as CI runs them, so `test.only` fails and no stray server is reused. */
export function checkEnv() {
  return { ...commandEnv(), CI: '1' };
}

/** The process groups still running, so a stopped harness can stop them too. */
const running = new Set();

/** Stops every process group the harness started that is still running. */
export function stopAll() {
  for (const pid of running) {
    stopGroup(pid, 'SIGKILL');
  }
}

function stopGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already exited.
  }
}

/**
 * Runs one command in its own process group and resolves when it exits, or
 * when `timeoutMs` passes. It then stops the whole group, because a server a
 * command left running would hold a port the next step needs.
 */
function exec(argv, { cwd, input, timeoutMs, stdoutFile, env = commandEnv() }) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(argv[0], argv.slice(1), { cwd, env, detached: true });
    running.add(child.pid);
    const file = stdoutFile ? createWriteStream(stdoutFile) : null;
    let stdout = '';
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => {
      if (file) {
        file.write(chunk);
        return;
      }
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    // A command that exits without reading its input closes the pipe early.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stopGroup(child.pid, 'SIGTERM');
          setTimeout(() => stopGroup(child.pid, 'SIGKILL'), 10_000).unref();
        }, timeoutMs)
      : undefined;
    const finish = (code) => {
      clearTimeout(timer);
      stopGroup(child.pid, 'SIGKILL');
      running.delete(child.pid);
      const result = { code, timedOut, stdout, output, ms: Date.now() - started };
      if (file) {
        file.end(() => done(result));
      } else {
        done(result);
      }
    };
    child.on('error', (error) => {
      output += String(error);
      finish(127);
    });
    child.on('close', (code, signal) => finish(code ?? (signal ? 128 : 1)));
  });
}

const isPortBusy = (port) =>
  new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(true));
    server.listen(port, '127.0.0.1', () => server.close(() => done(false)));
  });

/** The processes listening on TCP `port`, from `lsof`, or none when it is missing. */
function listeners(port) {
  const found = spawnSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return (found.stdout ?? '').split('\n').filter(Boolean).map(Number);
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Stops whatever listens on `port`: SIGTERM to each listener's process group
 * (a detached server leads its own), then SIGKILL if the port is still busy
 * after five seconds.
 */
async function stopListeners(port) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const pid of listeners(port)) {
      stopGroup(pid, signal);
      try {
        process.kill(pid, signal);
      } catch {
        // It has already exited.
      }
    }
    for (let waited = 0; waited < 5_000 && (await isPortBusy(port)); waited += 100) {
      await pause(100);
    }
  }
}

/** @returns {import('./run-trial.mjs').Deps} */
export function systemDeps() {
  return {
    exec,
    now: () => new Date(),
    freeDiskBytes: (path) => {
      const stats = statfsSync(path);
      return stats.bavail * stats.bsize;
    },
    isPortBusy,
    stopListeners,
  };
}
