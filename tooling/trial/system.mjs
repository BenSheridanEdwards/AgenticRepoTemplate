/**
 * The trial harness's one door to the system: processes, disk, ports and the
 * environment each command gets (ADR 0034). `run-trial.mjs` takes these as
 * injected `Deps`, so its tests swap in fakes.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statfsSync,
} from 'node:fs';
import { createServer } from 'node:net';

/** Git's per-repository variables, which a hook exports and a child repository must not inherit. */
const GIT_LOCAL_ENV = (
  spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout ?? ''
)
  .split('\n')
  .filter(Boolean);

/** Variables pnpm sets for a script it runs, which point back at the invoking checkout. */
const PNPM_SCRIPT_ENV = /^(npm_|INIT_CWD$|PNPM_SCRIPT_SRC_DIR$)/;

/**
 * The variables an agent gets: what the shell and the toolchain need, and how
 * Claude finds its config and authenticates. Anything else, such as
 * `ANTHROPIC_MODEL` or `MAX_THINKING_TOKENS`, would change the session
 * without a trace in the evidence. The temp and cache variables come from the
 * trial's private env instead.
 */
const AGENT_ENV = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'TERM',
  'TZ',
  'PNPM_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'AWS_REGION',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'CLOUD_ML_REGION',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
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
  return env;
}

/**
 * A trial command's environment: every command's, with the trial's private
 * temp and cache folders over the shared ones (ADR 0038).
 *
 * @param {Readonly<Record<string, string>>} privateEnv
 */
export function trialEnv(privateEnv) {
  return { ...commandEnv(), ...privateEnv };
}

/**
 * The agent's environment, from `AGENT_ENV` and the `LC_*` locale variables
 * alone, so a harness started inside a Claude Code session still starts a
 * fresh top-level one, with its config folder and credentials, plus the
 * trial's private folders.
 *
 * @param {Readonly<Record<string, string>>} privateEnv
 */
export function agentEnv(privateEnv) {
  return {
    ...Object.fromEntries(
      Object.entries(commandEnv()).filter(
        ([name]) => AGENT_ENV.has(name) || name.startsWith('LC_'),
      ),
    ),
    ...privateEnv,
  };
}

/**
 * The checks' environment: as CI runs them, so `test.only` fails and no stray
 * server is reused, with the trial's private folders.
 *
 * @param {Readonly<Record<string, string>>} privateEnv
 */
export function checkEnv(privateEnv) {
  return { ...trialEnv(privateEnv), CI: '1' };
}

/**
 * `argv` inside bubblewrap, with `folder` mounted over `over` (the shared
 * `/tmp`) and each `keep` path mounted back at itself, so a kept path under
 * `over` stays in view (ADR 0038). The rest of the filesystem is the host's.
 *
 * @param {readonly string[]} argv
 * @param {import('./run-trial.mjs').PrivateTmp} privateTmp
 */
function confine(argv, { folder, over, keep }) {
  return [
    'bwrap',
    '--dev-bind',
    '/',
    '/',
    '--bind',
    folder,
    over,
    ...keep.flatMap((path) => ['--bind', path, path]),
    '--',
    ...argv,
  ];
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
 * Runs one command in its own process group, inside `confine` when it has a
 * `privateTmp`, and resolves when it exits, with no time limit (ADR 0038). It
 * then stops the whole group, because a server a command left running would
 * hold a port the next step needs.
 */
function exec(argv, { cwd, input, stdoutFile, env = commandEnv(), privateTmp }) {
  return new Promise((done) => {
    const started = Date.now();
    const [command, ...args] = privateTmp ? confine(argv, privateTmp) : argv;
    const child = spawn(command, args, { cwd, env, detached: true });
    running.add(child.pid);
    const file = stdoutFile ? createWriteStream(stdoutFile) : null;
    let stdout = '';
    let output = '';
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
    const finish = (code) => {
      stopGroup(child.pid, 'SIGKILL');
      running.delete(child.pid);
      const result = { code, stdout, output, ms: Date.now() - started };
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

/** `TCP_LISTEN` in the kernel's socket tables. */
const LISTEN_STATE = '0A';

/**
 * The processes listening on TCP `port`: from the `/proc` socket tables, so a
 * Linux box without `lsof` still finds them, and from `lsof` where those
 * tables are missing or unreadable, or none when `lsof` is missing too.
 */
export function listeners(port, proc = '/proc') {
  try {
    return procListeners(port, proc);
  } catch {
    const found = spawnSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return (found.stdout ?? '').split('\n').filter(Boolean).map(Number);
  }
}

/** Throws when `proc` has no readable IPv4 socket table. */
function procListeners(port, proc) {
  const address = `:${port.toString(16).toUpperCase().padStart(4, '0')}`;
  const ipv6 = `${proc}/net/tcp6`;
  const sockets = new Set();
  for (const table of [`${proc}/net/tcp`, ...(existsSync(ipv6) ? [ipv6] : [])]) {
    for (const row of readFileSync(table, 'utf8').trim().split('\n').slice(1)) {
      const [, local, , state, , , , , , inode] = row.trim().split(/\s+/);
      if (local.endsWith(address) && state === LISTEN_STATE) {
        sockets.add(`socket:[${inode}]`);
      }
    }
  }
  if (sockets.size === 0) {
    return [];
  }
  return readdirSync(proc)
    .filter((entry) => /^\d+$/.test(entry) && holdsAny(`${proc}/${entry}/fd`, sockets))
    .map(Number);
}

/** Whether a process's open files include one of `sockets`; false for one that exited or is not ours. */
function holdsAny(fdDir, sockets) {
  try {
    return readdirSync(fdDir).some((fd) => {
      try {
        return sockets.has(readlinkSync(join(fdDir, fd)));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
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
