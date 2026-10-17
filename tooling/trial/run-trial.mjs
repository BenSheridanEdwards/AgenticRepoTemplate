#!/usr/bin/env node
/**
 * Runs one Todo trial end to end and records its evidence (ADR 0034).
 *
 *   node tooling/trial/run-trial.mjs --trial <1|2|3> --scaffold <rev>
 *     [--trials-root <dir>] [--dry-run] [--retry] [--agent-command <path>]
 *
 * It clones the invoking checkout at the scaffold revision into a fresh
 * workdir, runs one fresh Claude session on the fixed prompt, commits the
 * result, runs every check on a clean clone of that commit and writes
 * `docs/trials/<id>.json` (plus a patch when the run fails) into the invoking
 * checkout. It never deletes the workdir; it prints the path for whoever runs
 * the next trial.
 *
 * `planTrial` and `renderPrompt` are pure. `runTrial` reaches the system only
 * through the injected `Deps`, so the tests drive it with a fake agent.
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REQUIRED_CHECKS, validateEvidence } from './evidence.mjs';
import { findOutsideReads, redactSecrets, streamEvents, summarizeStream } from './stream.mjs';
import { agentEnv, checkEnv, stopAll, systemDeps } from './system.mjs';

const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const TEMPLATE_PATH = 'tooling/trial/todo-prompt.md';
const LOCKFILE = 'pnpm-lock.yaml';
const SIGN_OFF = 'Signed-off-by: Ben Sheridan-Edwards <bensheridanedwards@gmail.com>';
const MINUTE = 60_000;
const MIN_FREE_DISK_BYTES = 5e9;
const OUTPUT_TAIL_LINES = 200;
/** The reference result's ports and the ports `listResults` gives the one showcase result in a trial clone. */
const TRIAL_PORTS = [5173, 3001, 5183, 3011];
/** The files that make up the harness, hashed into `harness.sha256`. */
const HARNESS_FILES = ['run-trial.mjs', 'evidence.mjs', 'stream.mjs', 'system.mjs'];

/** The brief's command, plus the flags that make the session recordable. Never `--resume` or `--continue`. */
const AGENT_FLAGS = [
  '-p',
  '--model',
  'opus',
  '--permission-mode',
  'bypassPermissions',
  '--output-format',
  'stream-json',
  '--verbose',
  '--session-id',
];
const AGENT_TIMEOUT_MS = 90 * MINUTE;

/** A trial's `enforcementRev` is the last scaffold commit that touched one of these. */
const ENFORCEMENT_PATHS = [
  '.husky',
  '.github/workflows',
  '.claude',
  '.fallowrc.jsonc',
  '.mcp.json',
  '.npmrc',
  '.size-limit.json',
  'biome.json',
  'commitlint.config.ts',
  'eslint.config.js',
  'jest.config.ts',
  'jest.setup.ts',
  'lighthouserc.json',
  'package.json',
  'playwright.config.ts',
  'pnpm-workspace.yaml',
  'scripts',
  'tooling',
  ':(glob)tsconfig*.json',
];

/** What the agent loads from its user-level config folder, hashed into `userConfigSha256`. */
const USER_CONFIG_ENTRIES = [
  'settings.json',
  'CLAUDE.md',
  'agents',
  'commands',
  'output-styles',
  'remote-settings.json',
  'rules',
  'skills',
  'plugins/installed_plugins.json',
];

/**
 * @typedef {{ name: string, argv: readonly string[], timeoutMs: number }} Command
 * @typedef {{
 *   trial: 1 | 2 | 3, id: string, scaffoldRev: string, root: string, trialsRoot: string,
 *   workdir: string, origin: string, clone: string, checkClone: string, branch: string,
 *   evidencePath: string, patchPath: string, keptStreamPath: string, promptPath: string, streamPath: string,
 *   sessionId: string, agentArgv: readonly string[], fake: boolean, retry: boolean,
 *   claudeConfigDir: string, claudeStateFile: string, pnpmStore: string | null,
 *   ports: readonly number[], setup: readonly Command[], checks: readonly Command[],
 * }} TrialPlan
 * @typedef {{ code: number, timedOut: boolean, stdout: string, output: string, ms: number }} ExecResult
 * @typedef {{
 *   exec: (argv: readonly string[], options: { cwd: string, input?: string, timeoutMs?: number, stdoutFile?: string, env?: NodeJS.ProcessEnv }) => Promise<ExecResult>,
 *   now: () => Date,
 *   freeDiskBytes: (path: string) => number,
 *   isPortBusy: (port: number) => Promise<boolean>,
 *   stopListeners: (port: number) => Promise<void>,
 * }} Deps
 * @typedef {import('./evidence.mjs').TrialEvidence} TrialEvidence
 */

/** Before the agent: install the clone's dependencies, which also installs its git hooks. */
const SETUP = [
  { name: 'install', argv: ['pnpm', 'install', '--frozen-lockfile'], timeoutMs: 15 * MINUTE },
];

/** After the commit, on a clean clone of it: every gate, as a pull request runs them. */
const CHECKS = [
  { name: 'install', argv: ['pnpm', 'install', '--frozen-lockfile'], timeoutMs: 15 * MINUTE },
  { name: 'verify', argv: ['pnpm', 'verify'], timeoutMs: 45 * MINUTE },
  { name: 'e2e', argv: ['pnpm', 'e2e'], timeoutMs: 30 * MINUTE },
  {
    name: 'structure',
    argv: ['node', 'tooling/architecture/structure.mjs'],
    timeoutMs: 5 * MINUTE,
  },
];

/**
 * @param {{
 *   trial: number, scaffoldRev: string, root: string, trialsRoot: string, now: Date,
 *   sessionId: string, agentCommand?: string, claudeConfigDir: string, claudeStateFile?: string,
 *   pnpmStore?: string | null, retry: boolean,
 * }} options
 * @returns {TrialPlan}
 */
export function planTrial(options) {
  const { trial, scaffoldRev, root, trialsRoot, now, sessionId, agentCommand } = options;
  if (trial !== 1 && trial !== 2 && trial !== 3) {
    throw new Error(`--trial must be 1, 2 or 3, got ${trial}`);
  }
  if (!/^[0-9a-f]{40}$/.test(scaffoldRev)) {
    throw new Error(`--scaffold must name a full 40-hex commit, got ${scaffoldRev}`);
  }
  const id = `todo-0${trial}`;
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
  const workdir = join(trialsRoot, `${id}-${stamp}`);
  return {
    trial,
    id,
    scaffoldRev,
    root,
    trialsRoot,
    workdir,
    origin: join(workdir, 'origin.git'),
    clone: join(workdir, 'repo'),
    checkClone: join(workdir, 'check'),
    branch: `trial/${id}`,
    evidencePath: join(root, 'docs/trials', `${id}.json`),
    patchPath: join(root, 'docs/trials', `${id}.patch`),
    keptStreamPath: join(root, 'docs/trials', `${id}.stream.jsonl`),
    promptPath: join(workdir, 'prompt.md'),
    streamPath: join(workdir, 'agent.stream.jsonl'),
    sessionId,
    agentArgv: [agentCommand ?? 'claude', ...AGENT_FLAGS, sessionId],
    fake: agentCommand !== undefined,
    retry: options.retry,
    claudeConfigDir: options.claudeConfigDir,
    claudeStateFile:
      options.claudeStateFile ?? join(dirname(options.claudeConfigDir), '.claude.json'),
    pnpmStore: options.pnpmStore ?? null,
    ports: TRIAL_PORTS,
    setup: SETUP,
    checks: CHECKS,
  };
}

/**
 * @param {string} template
 * @param {Pick<TrialPlan, 'id' | 'trial'>} plan
 */
export function renderPrompt(template, plan) {
  const prompt = template.replaceAll('{{ID}}', plan.id).replaceAll('{{N}}', String(plan.trial));
  const unfilled = prompt.match(/\{\{[A-Z_]+\}\}/);
  if (unfilled) {
    throw new Error(
      `The prompt template has a placeholder the harness does not fill: ${unfilled[0]}`,
    );
  }
  return prompt;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const tail = (text) => text.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
const commandText = (argv) => argv.join(' ');

/** @param {Deps} deps */
async function git(deps, cwd, ...args) {
  const run = await deps.exec(['git', ...args], { cwd });
  if (run.code !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${run.code}: ${run.output.trim()}`);
  }
  return run.stdout.trim();
}

/** A file's bytes at the scaffold, or null when the scaffold lacks it. */
async function atScaffold(plan, deps, path) {
  const shown = await deps.exec(['git', 'show', `${plan.scaffoldRev}:${path}`], { cwd: plan.root });
  return shown.code === 0 ? shown.stdout : null;
}

/**
 * The harness that judges this run: a hash of its files, and whether they
 * equal the scaffold's copy, so a harness change between trials shows.
 */
async function readHarness(plan, deps) {
  const files = HARNESS_FILES.map((name) => ({
    name,
    text: readFileSync(join(HARNESS_ROOT, 'tooling/trial', name), 'utf8'),
  }));
  const scaffold = await Promise.all(
    files.map(({ name }) => atScaffold(plan, deps, `tooling/trial/${name}`)),
  );
  return {
    sha256: sha256(files.map(({ name, text }) => `${name}\0${sha256(text)}`).join('\n')),
    matchesScaffold: files.every(({ text }, index) => scaffold[index] === text),
  };
}

/**
 * The inputs every trial must share, read from the scaffold commit: the
 * prompt, the lockfile and the enforcement revision, plus the harness itself.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function readScaffold(plan, deps) {
  const template = await atScaffold(plan, deps, TEMPLATE_PATH);
  const lockfile = await atScaffold(plan, deps, LOCKFILE);
  for (const [path, text] of [
    [TEMPLATE_PATH, template],
    [LOCKFILE, lockfile],
  ]) {
    if (text === null) {
      throw new Error(`The scaffold ${plan.scaffoldRev} has no ${path}.`);
    }
  }
  const enforcementRev = await git(
    deps,
    plan.root,
    'log',
    '-1',
    '--format=%H',
    plan.scaffoldRev,
    '--',
    ...ENFORCEMENT_PATHS,
  );
  return {
    template,
    prompt: renderPrompt(template, plan),
    lockfile,
    enforcementRev: enforcementRev || plan.scaffoldRev,
    harness: await readHarness(plan, deps),
  };
}

/**
 * Throws when the trial must not start. Returns the earlier attempts a
 * `--retry` carries forward.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function checkPreconditions(plan, deps) {
  let retries = [];
  const evidenceName = relative(plan.root, plan.evidencePath);
  if (existsSync(plan.evidencePath)) {
    if (!plan.retry) {
      throw new Error(
        `${evidenceName} exists. Every run counts; pass --retry only after a failure from before the agent started.`,
      );
    }
    const earlier = validateEvidence(JSON.parse(readFileSync(plan.evidencePath, 'utf8')));
    if (earlier.run.agentExitCode !== null) {
      throw new Error(`${evidenceName} records a run in which the agent already ran. It is final.`);
    }
    retries = [
      ...earlier.retries,
      { startedAt: earlier.run.startedAt, failures: earlier.failures },
    ];
  }
  const others = existsSync(plan.trialsRoot) ? readdirSync(plan.trialsRoot) : [];
  if (others.length > 0) {
    throw new Error(
      `Remove the earlier trial workdirs before this run, so no result is in reach: ${others.map((name) => join(plan.trialsRoot, name)).join(', ')}`,
    );
  }
  const free = deps.freeDiskBytes(plan.root);
  if (free < MIN_FREE_DISK_BYTES) {
    throw new Error(`Only ${(free / 1e9).toFixed(1)} GB free disk; a trial needs 5 GB.`);
  }
  for (const port of plan.ports) {
    if (await deps.isPortBusy(port)) {
      throw new Error(`port ${port} is busy; a trial's servers need it.`);
    }
  }
  return retries;
}

/**
 * A bare origin holding only the scaffold's history as `main`, and a blobless
 * clone of it on `trial/<id>`. The clone's hooks see `origin/main` at the
 * scaffold, and no other branch of the invoking checkout is reachable.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function prepareClone(plan, deps) {
  await git(deps, plan.workdir, 'init', '-q', '--bare', '--initial-branch=main', plan.origin);
  await git(
    deps,
    plan.origin,
    'fetch',
    '-q',
    '--no-tags',
    '--upload-pack',
    'git -c uploadpack.allowAnySHA1InWant=true upload-pack',
    plan.root,
    `${plan.scaffoldRev}:refs/heads/main`,
  );
  // FETCH_HEAD would name the evidence checkout inside the agent's workdir.
  rmSync(join(plan.origin, 'FETCH_HEAD'), { force: true });
  await git(deps, plan.origin, 'config', 'uploadpack.allowFilter', 'true');
  await git(
    deps,
    plan.workdir,
    'clone',
    '-q',
    '--filter=blob:none',
    '--branch',
    'main',
    pathToFileURL(plan.origin).href,
    plan.clone,
  );
  await git(deps, plan.clone, 'switch', '-q', '-c', plan.branch);
  const status = await git(deps, plan.clone, 'status', '--porcelain', '--untracked-files=all');
  if (status !== '') {
    throw new Error(`the fresh clone is not clean:\n${status}`);
  }
  const showcase = join(plan.clone, 'showcase');
  const results = existsSync(showcase) ? readdirSync(showcase) : [];
  if (results.length > 0) {
    throw new Error(`the scaffold already holds showcase results: ${results.join(', ')}`);
  }
}

/**
 * @param {readonly Command[]} commands
 * @param {string} cwd
 * @param {Deps} deps
 * @param {NodeJS.ProcessEnv} [env]
 */
async function runCommands(commands, cwd, deps, env) {
  const records = [];
  for (const command of commands) {
    const run = await deps.exec(command.argv, { cwd, timeoutMs: command.timeoutMs, env });
    records.push({
      name: command.name,
      command: commandText(command.argv),
      exitCode: run.code,
      durationMs: run.ms,
      outputTail: tail(run.output),
    });
  }
  return records;
}

/**
 * The checks whose entry point the scaffold lacks: a `node <file>` that is
 * missing, or a `pnpm <script>` the root manifest does not define. Found
 * before the agent starts, so a broken scaffold costs no trial.
 *
 * @param {TrialPlan} plan
 */
function missingCheckEntries(plan) {
  const manifest = join(plan.clone, 'package.json');
  const scripts = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {})
    : {};
  return plan.checks.flatMap(({ name, argv: [tool, entry] }) => {
    const missing =
      (tool === 'node' &&
        entry &&
        !entry.startsWith('-') &&
        !existsSync(join(plan.clone, entry))) ||
      (tool === 'pnpm' && entry && entry !== 'install' && !(entry in scripts));
    return missing ? [`check ${name} needs ${entry}, which the scaffold lacks`] : [];
  });
}

/** Every file under `path`, or `path` itself, as `<relative path>\0<sha256>` lines. */
function fingerprint(root, path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    return [];
  }
  if (statSync(full).isDirectory()) {
    return readdirSync(full)
      .sort()
      .flatMap((entry) => fingerprint(root, join(path, entry)));
  }
  return [`${path}\0${sha256(readFileSync(full))}`];
}

/** @param {TrialPlan} plan */
function userConfigSha256(plan) {
  const files = USER_CONFIG_ENTRIES.flatMap((entry) => fingerprint(plan.claudeConfigDir, entry));
  const state = existsSync(plan.claudeStateFile)
    ? JSON.parse(readFileSync(plan.claudeStateFile, 'utf8'))
    : {};
  const mcpServers = JSON.stringify(state.mcpServers ?? null);
  return sha256([...files, `mcpServers\0${sha256(mcpServers)}`].join('\n'));
}

/** The lockfile without the importer entries of this trial's two packages. */
function withoutOwnImporters(lockfile, id) {
  const own = new RegExp(`^  showcase/${id}/(web|api):$`);
  let dropping = false;
  return lockfile
    .split('\n')
    .filter((line) => {
      if (/^\S/.test(line) || /^ {2}\S/.test(line)) {
        dropping = own.test(line);
      }
      return !dropping;
    })
    .join('\n');
}

/**
 * Every path the agent changed, committed or not, and the ones outside its
 * scope: anything but `showcase/<id>/`, and any lockfile change beyond its own
 * two importers. Renames count as a deletion and an addition, so a file moved
 * out of `apps/` shows.
 *
 * @param {TrialPlan} plan
 * @param {string} scaffoldLockfile
 * @param {Deps} deps
 */
async function inspectChanges(plan, scaffoldLockfile, deps) {
  const lines = async (...args) =>
    (await git(deps, plan.clone, ...args)).split('\n').filter(Boolean);
  const changedPaths = [
    ...new Set([
      ...(await lines('diff', '--name-only', '--no-renames', plan.scaffoldRev, 'HEAD')),
      ...(await lines('diff', '--name-only', '--no-renames', 'HEAD')),
      ...(await lines('ls-files', '--others', '--exclude-standard')),
    ]),
  ].sort();
  const lockfilePath = join(plan.clone, LOCKFILE);
  const lockfileInScope =
    existsSync(lockfilePath) &&
    withoutOwnImporters(readFileSync(lockfilePath, 'utf8'), plan.id) ===
      withoutOwnImporters(scaffoldLockfile, plan.id);
  const outsideScope = changedPaths.filter((path) =>
    path === LOCKFILE ? !lockfileInScope : !path.startsWith(`showcase/${plan.id}/`),
  );
  return { changedPaths, outsideScope };
}

/**
 * Puts the clone back on `trial/<id>` at the scaffold, keeping the agent's
 * work in the tree, so the harness makes the one result commit with the hooks
 * on whatever the agent committed or checked out.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function rewindToScaffold(plan, deps) {
  await git(deps, plan.clone, 'reset', '-q', '--mixed', plan.scaffoldRev);
  await git(deps, plan.clone, 'checkout', '-q', '-B', plan.branch);
  await git(deps, plan.clone, 'update-ref', 'refs/heads/main', plan.scaffoldRev);
}

/**
 * Commits the result with the hooks on. Returns the result commit, or the
 * reason there is none.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function commitResult(plan, deps) {
  const paths = [`showcase/${plan.id}`, LOCKFILE].filter((path) =>
    existsSync(join(plan.clone, path)),
  );
  if (paths.length > 0) {
    await git(deps, plan.clone, 'add', '-A', '--', ...paths);
  }
  const staged = await git(deps, plan.clone, 'diff', '--cached', '--name-only');
  if (staged === '') {
    return { commit: null, failure: `the agent left no change under showcase/${plan.id}/` };
  }
  const commit = await deps.exec(
    [
      'git',
      'commit',
      '-q',
      '-m',
      `feat(showcase): add ${plan.id} trial result`,
      '-m',
      `Trial ${plan.trial} of the Todo trials at scaffold ${plan.scaffoldRev}.\n\n${SIGN_OFF}`,
    ],
    { cwd: plan.clone, timeoutMs: 15 * MINUTE },
  );
  if (commit.code !== 0) {
    return {
      commit: null,
      failure: `commit hooks failed (exit ${commit.code}):\n${tail(commit.output)}`,
    };
  }
  return { commit: await git(deps, plan.clone, 'rev-parse', 'HEAD'), failure: null };
}

/**
 * Keeps the code of a failed run: its commits since the scaffold plus
 * everything left uncommitted.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function writePatch(plan, deps) {
  await git(deps, plan.clone, 'add', '-A');
  const committed = await git(
    deps,
    plan.clone,
    'format-patch',
    '--stdout',
    `${plan.scaffoldRev}..HEAD`,
  );
  const uncommitted = await git(deps, plan.clone, 'diff', '--cached', '--binary', 'HEAD');
  const patch = [committed, uncommitted].filter(Boolean).join('\n');
  if (patch === '') {
    return null;
  }
  mkdirSync(dirname(plan.patchPath), { recursive: true });
  writeFileSync(plan.patchPath, `${patch}\n`);
  return relative(plan.root, plan.patchPath);
}

/**
 * Writes the evidence as Biome formats it, through a temporary file, so a
 * crash never leaves half a record.
 *
 * @param {TrialPlan} plan
 * @param {TrialEvidence} evidence
 * @param {Deps} deps
 */
async function writeEvidence(plan, evidence, deps) {
  const formatted = await deps.exec(
    [
      join(HARNESS_ROOT, 'node_modules/.bin/biome'),
      'format',
      `--stdin-file-path=docs/trials/${plan.id}.json`,
    ],
    { cwd: HARNESS_ROOT, input: JSON.stringify(evidence) },
  );
  const text = formatted.code === 0 ? formatted.stdout : `${JSON.stringify(evidence, null, 2)}\n`;
  mkdirSync(dirname(plan.evidencePath), { recursive: true });
  const temporary = `${plan.evidencePath}.partial`;
  writeFileSync(temporary, text);
  renameSync(temporary, plan.evidencePath);
}

/**
 * @typedef {{
 *   plan: TrialPlan, deps: Deps, scaffold: Awaited<ReturnType<typeof readScaffold>>,
 *   startedAt: Date, retries: TrialEvidence['retries'],
 *   failures: string[], checks: TrialEvidence['checks'],
 *   agent: { version: string, userConfigSha256: string, resolvedModel: string | null },
 *   run: { agentExitCode: number | null, agentDurationMs: number | null, turns: number | null, costUsd: number | null },
 *   result: Omit<TrialEvidence['result'], 'status'>, stream: TrialEvidence['stream'],
 * }} RunState
 */

/** @param {RunState} state */
async function setupStage({ plan, deps, failures, agent }) {
  for (const setup of await runCommands(plan.setup, plan.clone, deps)) {
    if (setup.exitCode !== 0) {
      failures.push(`setup ${setup.name} exited ${setup.exitCode}`);
    }
  }
  failures.push(...missingCheckEntries(plan));
  const version = await deps.exec([plan.agentArgv[0], '--version'], { cwd: plan.clone });
  agent.version = version.stdout.trim();
  if (version.code !== 0) {
    failures.push(
      `${plan.agentArgv[0]} --version exited ${version.code}: ${version.output.trim()}`,
    );
  }
  agent.userConfigSha256 = userConfigSha256(plan);
}

/**
 * Runs the one agent session. Before it starts, a provisional record marks
 * the trial as run (`agentExitCode: -1`), so a harness stopped mid-session
 * still leaves a failed record that `--retry` refuses.
 *
 * @param {RunState} state
 */
async function agentStage(state) {
  const { plan, deps, scaffold, failures, agent, run, result } = state;
  writeFileSync(plan.promptPath, scaffold.prompt);
  run.agentExitCode = -1;
  await writeEvidence(
    plan,
    toEvidence({ ...state, failures: ['the harness stopped while the agent ran'] }, deps.now()),
    deps,
  );
  const session = await deps.exec(plan.agentArgv, {
    cwd: plan.clone,
    input: scaffold.prompt,
    timeoutMs: AGENT_TIMEOUT_MS,
    stdoutFile: plan.streamPath,
    env: agentEnv(),
  });
  run.agentExitCode = session.code;
  run.agentDurationMs = session.ms;
  if (session.code !== 0) {
    failures.push(
      session.timedOut ? 'the agent ran past its 90 minute limit' : `agent exited ${session.code}`,
    );
  }
  const streamText = readFileSync(plan.streamPath, 'utf8');
  const events = streamEvents(streamText);
  const { resolvedModel, turns, costUsd, userTextEvents } = summarizeStream(events);
  Object.assign(agent, { resolvedModel });
  Object.assign(run, { turns, costUsd });
  const kept = redactSecrets(streamText, process.env);
  mkdirSync(dirname(plan.keptStreamPath), { recursive: true });
  writeFileSync(plan.keptStreamPath, kept);
  state.stream = {
    path: relative(plan.root, plan.keptStreamPath),
    sha256: sha256(kept),
    userTextEvents,
  };
  result.outsideReads = findOutsideReads(events, {
    clone: plan.clone,
    allowedRoots: [
      plan.workdir,
      ...USER_CONFIG_ENTRIES.map((entry) => join(plan.claudeConfigDir, entry)),
      join(plan.claudeConfigDir, 'plugins'),
      ...(plan.pnpmStore ? [plan.pnpmStore] : []),
    ],
  });
  if (result.outsideReads.length > 0) {
    failures.push(`named paths outside the clone: ${result.outsideReads.join(', ')}`);
  }
}

/**
 * Stops a server the agent left on a trial port, which outlives the agent's
 * process group when it was started detached, so the checks, which reuse no
 * server, get their ports. It runs after the result commit, right before the
 * checks, so a server the agent started as it exited has had the hooks' run to start.
 * Only a server that will not stop fails the run.
 *
 * @param {RunState} state
 */
async function strayServerStage({ plan, deps, failures, result }) {
  for (const port of plan.ports) {
    if (!(await deps.isPortBusy(port))) {
      continue;
    }
    await deps.stopListeners(port);
    if (await deps.isPortBusy(port)) {
      failures.push(
        `port ${port} stayed busy after the harness stopped the server the agent left on it`,
      );
    } else {
      result.stoppedServers.push(port);
    }
  }
}

/** @param {RunState} state */
async function resultStage({ plan, deps, scaffold, failures, result }) {
  Object.assign(result, await inspectChanges(plan, scaffold.lockfile, deps));
  if (result.outsideScope.length > 0) {
    failures.push(`changed outside showcase/${plan.id}/: ${result.outsideScope.join(', ')}`);
  }
  await rewindToScaffold(plan, deps);
  const committed = await commitResult(plan, deps);
  result.commit = committed.commit;
  if (committed.failure) {
    failures.push(committed.failure);
  }
}

/**
 * Runs the checks on a fresh clone of the result commit, with CI's
 * environment, so they see exactly what was committed and nothing the agent
 * left behind in its tree.
 *
 * @param {RunState} state
 */
async function checksStage(state) {
  const { plan, deps, failures, result } = state;
  if (result.commit === null) {
    return;
  }
  await git(
    deps,
    plan.workdir,
    'clone',
    '-q',
    '--branch',
    plan.branch,
    plan.clone,
    plan.checkClone,
  );
  state.checks = await runCommands(plan.checks, plan.checkClone, deps, checkEnv());
  for (const check of state.checks.filter(({ exitCode }) => exitCode !== 0)) {
    failures.push(`check ${check.name} exited ${check.exitCode}`);
  }
  for (const name of REQUIRED_CHECKS.filter((required) =>
    state.checks.every((check) => check.name !== required),
  )) {
    failures.push(`check ${name} did not run`);
  }
}

/**
 * The run protocol in order. A stage marked `beforeAgent` stops the run on
 * its first failure, so a broken setup never reaches the agent; after the
 * agent, every stage runs, so a failed run still records all it can.
 */
const STAGES = [
  { run: ({ plan, deps }) => prepareClone(plan, deps), beforeAgent: true },
  { run: setupStage, beforeAgent: true },
  { run: agentStage, beforeAgent: false },
  { run: resultStage, beforeAgent: false },
  { run: strayServerStage, beforeAgent: false },
  { run: checksStage, beforeAgent: false },
];

/** @param {RunState} state */
async function runStages(state) {
  for (const stage of STAGES) {
    try {
      await stage.run(state);
    } catch (error) {
      state.failures.push(`harness: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (stage.beforeAgent && state.failures.length > 0) {
      return;
    }
  }
}

/**
 * @param {RunState} state
 * @param {Date} finishedAt
 * @returns {TrialEvidence}
 */
function toEvidence(state, finishedAt) {
  const { plan, scaffold, startedAt, retries, failures, checks, agent, run, result, stream } =
    state;
  return {
    schema: 1,
    trial: {
      number: plan.trial,
      id: plan.id,
      branch: plan.branch,
      workdir: basename(plan.workdir),
    },
    prompt: {
      path: TEMPLATE_PATH,
      templateSha256: sha256(scaffold.template),
      sha256: sha256(scaffold.prompt),
      text: scaffold.prompt,
    },
    scaffold: {
      rev: plan.scaffoldRev,
      enforcementRev: scaffold.enforcementRev,
      lockfileSha256: sha256(scaffold.lockfile),
    },
    harness: scaffold.harness,
    agent: {
      cli: plan.agentArgv[0],
      version: agent.version,
      argv: [...plan.agentArgv],
      sessionId: plan.sessionId,
      resolvedModel: agent.resolvedModel,
      userConfigSha256: agent.userConfigSha256,
      fake: plan.fake,
    },
    run: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      ...run,
    },
    result: { status: failures.length === 0 ? 'passed' : 'failed', ...result },
    stream,
    checks,
    failures,
    retries,
  };
}

/**
 * Runs the trial. Throws, writing nothing, when it must not start; once the
 * workdir exists, every outcome ends in an evidence file.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 * @returns {Promise<TrialEvidence>}
 */
export async function runTrial(plan, deps) {
  const scaffold = await readScaffold(plan, deps);
  const retries = await checkPreconditions(plan, deps);
  mkdirSync(plan.workdir, { recursive: true });
  /** @type {RunState} */
  const state = {
    plan,
    deps,
    scaffold,
    startedAt: deps.now(),
    retries,
    failures: [],
    checks: [],
    agent: { version: '', userConfigSha256: sha256(''), resolvedModel: null },
    run: { agentExitCode: null, agentDurationMs: null, turns: null, costUsd: null },
    result: {
      commit: null,
      changedPaths: [],
      outsideScope: [],
      outsideReads: [],
      stoppedServers: [],
      patch: null,
    },
    stream: { path: null, sha256: null, userTextEvents: null },
  };
  await runStages(state);
  if (state.failures.length > 0 && state.run.agentExitCode !== null) {
    state.result.patch = await writePatch(plan, deps);
  }
  const evidence = toEvidence(state, deps.now());
  await writeEvidence(plan, evidence, deps);
  return validateEvidence(evidence);
}

export { systemDeps };

function parseArguments(argv) {
  const options = { dryRun: false, retry: false };
  const valued = {
    '--trial': 'trial',
    '--scaffold': 'scaffold',
    '--trials-root': 'trialsRoot',
    '--agent-command': 'agentCommand',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dry-run') {
      options.dryRun = true;
    } else if (flag === '--retry') {
      options.retry = true;
    } else if (flag in valued && argv[index + 1] !== undefined) {
      options[valued[flag]] = argv[index + 1];
      index += 1;
    } else {
      throw new Error(
        `Unknown or incomplete argument ${flag}. See the header of tooling/trial/run-trial.mjs.`,
      );
    }
  }
  if (options.trial === undefined || options.scaffold === undefined) {
    throw new Error('Pass --trial <1|2|3> and --scaffold <rev>.');
  }
  return options;
}

const output = (command, cwd) => {
  const run = spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : null;
};

/** The checkout that keeps the evidence, and the scaffold revision resolved in it. */
function resolveCheckout(scaffold) {
  const root = output(['git', 'rev-parse', '--show-toplevel'], process.cwd());
  if (root === null) {
    throw new Error('Run the harness from inside the checkout that keeps the evidence.');
  }
  const scaffoldRev = output(
    ['git', 'rev-parse', '--verify', '--quiet', `${scaffold}^{commit}`],
    root,
  );
  if (scaffoldRev === null) {
    throw new Error(`--scaffold ${scaffold} is not a commit in ${root}.`);
  }
  return { root, scaffoldRev };
}

function planFromArguments(options) {
  const { root, scaffoldRev } = resolveCheckout(options.scaffold);
  const configDirFromEnv = process.env.CLAUDE_CONFIG_DIR;
  const claudeConfigDir = configDirFromEnv ?? join(homedir(), '.claude');
  return planTrial({
    trial: Number(options.trial),
    scaffoldRev,
    root,
    trialsRoot: resolve(options.trialsRoot ?? join(root, '..', 'trials')),
    now: new Date(),
    sessionId: randomUUID(),
    agentCommand: options.agentCommand && resolve(options.agentCommand),
    claudeConfigDir,
    claudeStateFile: configDirFromEnv && join(configDirFromEnv, '.claude.json'),
    pnpmStore: output(['pnpm', 'store', 'path'], root),
    retry: options.retry,
  });
}

/** @param {TrialPlan} plan */
async function printDryRun(plan, deps) {
  const { prompt, harness } = await readScaffold(plan, deps);
  const { trial, id, scaffoldRev, branch, workdir, clone, evidencePath, agentArgv, fake } = plan;
  const printed = { trial, id, scaffoldRev, branch, workdir, clone, evidencePath, agentArgv, fake };
  console.log(JSON.stringify({ ...printed, promptSha256: sha256(prompt), harness }, null, 2));
}

/**
 * @param {TrialPlan} plan
 * @param {TrialEvidence} evidence
 */
function printOutcome(plan, evidence) {
  const lines = [
    `${evidence.trial.id}: ${evidence.result.status}`,
    ...evidence.failures.map((failure) => `  - ${failure.split('\n')[0]}`),
    `evidence: ${relative(plan.root, plan.evidencePath)}`,
    ...(evidence.result.patch ? [`patch: ${evidence.result.patch}`] : []),
    ...(evidence.stream.path ? [`stream: ${evidence.stream.path}`] : []),
    `workdir (fetch ${plan.branch} from ${plan.clone}, then remove it): ${plan.workdir}`,
  ];
  console.log(lines.join('\n'));
}

async function main(argv) {
  const options = parseArguments(argv);
  const plan = planFromArguments(options);
  const deps = systemDeps();
  if (options.dryRun) {
    await printDryRun(plan, deps);
    return 0;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopAll();
      console.error(`Stopped by ${signal}. The provisional evidence and the workdir stay.`);
      process.exit(130);
    });
  }
  const evidence = await runTrial(plan, deps);
  printOutcome(plan, evidence);
  return evidence.result.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
