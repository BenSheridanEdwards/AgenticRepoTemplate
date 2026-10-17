#!/usr/bin/env node
/**
 * Runs one Todo trial end to end and records its evidence (ADR 0034).
 *
 *   node tooling/trial/run-trial.mjs --trial <1|2|3> --scaffold <rev>
 *     [--trials-root <dir>] [--dry-run] [--retry] [--agent-command <path>]
 *
 * It clones the invoking checkout at the scaffold revision into a fresh
 * workdir, runs one fresh Claude session on the fixed prompt, commits the
 * result, runs every check and writes `docs/trials/<id>.json` (plus a patch
 * when the run fails) into the invoking checkout. It never deletes the
 * workdir; it prints the path for whoever runs the next trial.
 *
 * `planTrial` and `renderPrompt` are pure. `runTrial` reaches the system only
 * through the injected `Deps`, so the tests drive it with a fake agent.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvidence } from './evidence.mjs';

const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const TEMPLATE_PATH = 'tooling/trial/todo-prompt.md';
const LOCKFILE = 'pnpm-lock.yaml';
const SIGN_OFF = 'Signed-off-by: Ben Sheridan-Edwards <bensheridanedwards@gmail.com>';
const MINUTE = 60_000;
const MIN_FREE_DISK_BYTES = 5e9;
const OUTPUT_TAIL_LINES = 200;
/** The reference result's ports and the ports `listResults` gives the one showcase result in a trial clone. */
const TRIAL_PORTS = [5173, 3001, 5183, 3011];

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
  'biome.json',
  'commitlint.config.ts',
  'eslint.config.js',
  'jest.config.ts',
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
  'skills',
  'plugins/installed_plugins.json',
];

/**
 * @typedef {{ name: string, argv: readonly string[], timeoutMs: number }} Command
 * @typedef {{
 *   trial: 1 | 2 | 3, id: string, scaffoldRev: string, root: string, trialsRoot: string,
 *   workdir: string, origin: string, clone: string, branch: string,
 *   evidencePath: string, patchPath: string, promptPath: string, streamPath: string,
 *   sessionId: string, agentArgv: readonly string[], fake: boolean, retry: boolean,
 *   claudeConfigDir: string, claudeStateFile: string, readRoots: readonly string[],
 *   setup: readonly Command[], checks: readonly Command[],
 * }} TrialPlan
 * @typedef {{ code: number, timedOut: boolean, stdout: string, output: string, ms: number }} ExecResult
 * @typedef {{
 *   exec: (argv: readonly string[], options: { cwd: string, input?: string, timeoutMs?: number, stdoutFile?: string, env?: NodeJS.ProcessEnv }) => Promise<ExecResult>,
 *   now: () => Date,
 *   freeDiskBytes: (path: string) => number,
 *   isPortBusy: (port: number) => Promise<boolean>,
 * }} Deps
 * @typedef {import('./evidence.mjs').TrialEvidence} TrialEvidence
 */

/** Before the agent: install the clone's dependencies, which also installs its git hooks. */
const SETUP = [
  { name: 'install', argv: ['pnpm', 'install', '--frozen-lockfile'], timeoutMs: 15 * MINUTE },
];

/** After the commit: every gate, as a pull request would run them. */
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
 *   readRoots: readonly string[], retry: boolean,
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
    branch: `trial/${id}`,
    evidencePath: join(root, 'docs/trials', `${id}.json`),
    patchPath: join(root, 'docs/trials', `${id}.patch`),
    promptPath: join(workdir, 'prompt.md'),
    streamPath: join(workdir, 'agent.stream.jsonl'),
    sessionId,
    agentArgv: [agentCommand ?? 'claude', ...AGENT_FLAGS, sessionId],
    fake: agentCommand !== undefined,
    retry: options.retry,
    claudeConfigDir: options.claudeConfigDir,
    claudeStateFile:
      options.claudeStateFile ?? join(dirname(options.claudeConfigDir), '.claude.json'),
    readRoots: options.readRoots,
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
const tail = (text) =>
  text
    .split('\n')
    .slice(-OUTPUT_TAIL_LINES - 1)
    .join('\n');
const commandText = (argv) => argv.join(' ');

/** @param {Deps} deps */
async function git(deps, cwd, ...args) {
  const run = await deps.exec(['git', ...args], { cwd });
  if (run.code !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${run.code}: ${run.output.trim()}`);
  }
  return run.stdout.trim();
}

/**
 * The inputs every trial must share: the prompt, the lockfile and the
 * enforcement revision, all read from the scaffold commit.
 *
 * @param {TrialPlan} plan
 * @param {Deps} deps
 */
async function readScaffold(plan, deps) {
  const at = async (path) => {
    const shown = await deps.exec(['git', 'show', `${plan.scaffoldRev}:${path}`], {
      cwd: plan.root,
    });
    if (shown.code !== 0) {
      throw new Error(`The scaffold ${plan.scaffoldRev} has no ${path}.`);
    }
    return shown.stdout;
  };
  const template = await at(TEMPLATE_PATH);
  const lockfile = await at(LOCKFILE);
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
  const prompt = renderPrompt(template, plan);
  return { template, prompt, lockfile, enforcementRev: enforcementRev || plan.scaffoldRev };
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
  const free = deps.freeDiskBytes(plan.trialsRoot);
  if (free < MIN_FREE_DISK_BYTES) {
    throw new Error(`Only ${(free / 1e9).toFixed(1)} GB free disk; a trial needs 5 GB.`);
  }
  for (const port of TRIAL_PORTS) {
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
  if (existsSync(join(plan.clone, 'showcase'))) {
    const results = readdirSync(join(plan.clone, 'showcase'));
    if (results.length > 0) {
      throw new Error(`the scaffold already holds showcase results: ${results.join(', ')}`);
    }
  }
}

/**
 * @param {readonly Command[]} commands
 * @param {string} cwd
 * @param {Deps} deps
 */
async function runCommands(commands, cwd, deps) {
  const records = [];
  for (const command of commands) {
    const run = await deps.exec(command.argv, { cwd, timeoutMs: command.timeoutMs });
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

/** Each JSON line of a stream-json transcript; a line that is not JSON is skipped. */
function streamEvents(text) {
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
function summarizeStream(events) {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
  const result = events.findLast((event) => event.type === 'result');
  const numberOrNull = (value) => (typeof value === 'number' ? value : null);
  return {
    resolvedModel: typeof init?.model === 'string' ? init.model : null,
    turns: numberOrNull(result?.num_turns),
    costUsd: numberOrNull(result?.total_cost_usd),
  };
}

/** Absolute paths in a shell command: after a space, a quote, `=`, `<`, `>` or `(`. */
const SHELL_PATH = /(?:^|[\s'"=<>(])(~?\/[^\s'"`;|&<>(){}$,]+)/g;

/**
 * Paths the agent's tool calls named outside its clone. File tools are read
 * from their path argument, and shell commands from their absolute path
 * words. The Claude config folder, the pnpm store, `/dev` and the temp folder
 * are allowed.
 *
 * @param {readonly object[]} events
 * @param {TrialPlan} plan
 */
function findOutsideReads(events, plan) {
  const allowed = [plan.clone, plan.claudeConfigDir, ...plan.readRoots, '/dev', tmpdir()];
  const inside = (path) =>
    allowed.some((root) => path === root || path.startsWith(`${root.replace(/\/$/, '')}/`));
  const named = events.flatMap((event) =>
    (Array.isArray(event.message?.content) ? event.message.content : [])
      .filter(
        (block) => block?.type === 'tool_use' && block.input && typeof block.input === 'object',
      )
      .flatMap(({ input }) => [
        ...[input.file_path, input.path, input.notebook_path].filter(
          (path) => typeof path === 'string',
        ),
        ...(typeof input.command === 'string'
          ? [...input.command.matchAll(SHELL_PATH)].map((match) => match[1])
          : []),
      ]),
  );
  const resolved = named.map((path) =>
    resolve(plan.clone, path.startsWith('~/') ? join(homedir(), path.slice(2)) : path),
  );
  return [...new Set(resolved.filter((path) => !inside(path)))].sort();
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
 * two importers.
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
      ...(await lines('diff', '--name-only', plan.scaffoldRev, 'HEAD')),
      ...(await lines('diff', '--name-only', 'HEAD')),
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
  if (staged !== '') {
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
  }
  const head = await git(deps, plan.clone, 'rev-parse', 'HEAD');
  return head === plan.scaffoldRev
    ? { commit: null, failure: `the agent left no change under showcase/${plan.id}/` }
    : { commit: head, failure: null };
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
 *   failures: string[], checks: TrialEvidence['checks'],
 *   agent: { version: string, userConfigSha256: string, resolvedModel: string | null },
 *   run: { agentExitCode: number | null, agentDurationMs: number | null, turns: number | null, costUsd: number | null },
 *   result: Omit<TrialEvidence['result'], 'status'>,
 * }} RunState
 */

/** @param {RunState} state */
async function setupStage({ plan, deps, failures, agent }) {
  for (const setup of await runCommands(plan.setup, plan.clone, deps)) {
    if (setup.exitCode !== 0) {
      failures.push(`setup ${setup.name} exited ${setup.exitCode}`);
    }
  }
  const version = await deps.exec([plan.agentArgv[0], '--version'], { cwd: plan.clone });
  agent.version = version.stdout.trim();
  if (version.code !== 0) {
    failures.push(
      `${plan.agentArgv[0]} --version exited ${version.code}: ${version.output.trim()}`,
    );
  }
  agent.userConfigSha256 = userConfigSha256(plan);
}

/** @param {RunState} state */
async function agentStage({ plan, deps, scaffold, failures, agent, run, result }) {
  writeFileSync(plan.promptPath, scaffold.prompt);
  const session = await deps.exec(plan.agentArgv, {
    cwd: plan.clone,
    input: scaffold.prompt,
    timeoutMs: AGENT_TIMEOUT_MS,
    stdoutFile: plan.streamPath,
    env: agentEnv(childEnv()),
  });
  run.agentExitCode = session.code;
  run.agentDurationMs = session.ms;
  if (session.code !== 0) {
    failures.push(
      session.timedOut ? 'the agent ran past its 90 minute limit' : `agent exited ${session.code}`,
    );
  }
  const events = streamEvents(readFileSync(plan.streamPath, 'utf8'));
  const { resolvedModel, turns, costUsd } = summarizeStream(events);
  Object.assign(agent, { resolvedModel });
  Object.assign(run, { turns, costUsd });
  result.outsideReads = findOutsideReads(events, plan);
  if (result.outsideReads.length > 0) {
    failures.push(`named paths outside the clone: ${result.outsideReads.join(', ')}`);
  }
}

/** @param {RunState} state */
async function resultStage({ plan, deps, scaffold, failures, result }) {
  Object.assign(result, await inspectChanges(plan, scaffold.lockfile, deps));
  if (result.outsideScope.length > 0) {
    failures.push(`changed outside showcase/${plan.id}/: ${result.outsideScope.join(', ')}`);
  }
  const committed = await commitResult(plan, deps);
  result.commit = committed.commit;
  if (committed.failure) {
    failures.push(committed.failure);
  }
}

/** @param {RunState} state */
async function checksStage(state) {
  const { plan, deps, failures, result } = state;
  if (result.commit === null) {
    return;
  }
  state.checks = await runCommands(plan.checks, plan.clone, deps);
  for (const check of state.checks.filter(({ exitCode }) => exitCode !== 0)) {
    failures.push(`check ${check.name} exited ${check.exitCode}`);
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
 * @param {{ startedAt: Date, finishedAt: Date, retries: TrialEvidence['retries'] }} times
 * @returns {TrialEvidence}
 */
function toEvidence({ plan, scaffold, failures, checks, agent, run, result }, times) {
  const { startedAt, finishedAt, retries } = times;
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
  const startedAt = deps.now();
  mkdirSync(plan.workdir, { recursive: true });
  /** @type {RunState} */
  const state = {
    plan,
    deps,
    scaffold,
    failures: [],
    checks: [],
    agent: { version: '', userConfigSha256: sha256(''), resolvedModel: null },
    run: { agentExitCode: null, agentDurationMs: null, turns: null, costUsd: null },
    result: { commit: null, changedPaths: [], outsideScope: [], outsideReads: [], patch: null },
  };
  await runStages(state);
  if (state.failures.length > 0 && state.run.agentExitCode !== null) {
    state.result.patch = await writePatch(plan, deps);
  }
  const evidence = toEvidence(state, { startedAt, finishedAt: deps.now(), retries });
  await writeEvidence(plan, evidence, deps);
  return validateEvidence(evidence);
}

/**
 * The agent's environment: the caller's, without the variables a parent Claude
 * Code session sets, so the trial is a fresh top-level session.
 *
 * @param {NodeJS.ProcessEnv} env
 */
function agentEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !name.startsWith('CLAUDE') || name === 'CLAUDE_CONFIG_DIR',
    ),
  );
}

/** Git's per-repository variables, which a hook exports and a child repository must not inherit. */
const GIT_LOCAL_ENV = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
  .stdout.split('\n')
  .filter(Boolean);

/** The environment every command gets: the caller's, without git's per-repository variables, with `COREPACK_HOME`. */
function childEnv() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !GIT_LOCAL_ENV.includes(name)),
  );
  env.COREPACK_HOME ??= join(homedir(), '.cache/node/corepack');
  return env;
}

/** @returns {Deps} */
export function systemDeps() {
  return {
    exec: (argv, { cwd, input, timeoutMs, stdoutFile, env = childEnv() }) =>
      new Promise((done) => {
        const started = Date.now();
        const child = spawn(argv[0], argv.slice(1), {
          cwd,
          env,
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const file = stdoutFile ? createWriteStream(stdoutFile) : null;
        let stdout = '';
        let output = '';
        let timedOut = false;
        child.stdout.on('data', (chunk) => {
          file?.write(chunk);
          if (!file) {
            stdout += chunk;
          }
          output += chunk;
        });
        child.stderr.on('data', (chunk) => {
          output += chunk;
        });
        // A command that exits without reading its input closes the pipe early.
        child.stdin.on('error', () => undefined);
        child.stdin.end(input ?? '');
        const stopGroup = (signal) => {
          try {
            process.kill(-child.pid, signal);
          } catch {
            // The group has already exited.
          }
        };
        const timer = timeoutMs
          ? setTimeout(() => {
              timedOut = true;
              stopGroup('SIGTERM');
              setTimeout(() => stopGroup('SIGKILL'), 10_000).unref();
            }, timeoutMs)
          : undefined;
        const finish = (code) => {
          clearTimeout(timer);
          // A server the command left running would hold a port the next step needs.
          stopGroup('SIGKILL');
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
      }),
    now: () => new Date(),
    freeDiskBytes: (path) => {
      const stats = statfsSync(path);
      return stats.bavail * stats.bsize;
    },
    isPortBusy: (port) =>
      new Promise((done) => {
        const server = createServer();
        server.once('error', () => done(true));
        server.listen(port, '127.0.0.1', () => server.close(() => done(false)));
      }),
  };
}

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
  const pnpmStore = options.dryRun ? null : output(['pnpm', 'store', 'path'], root);
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
    readRoots: [pnpmStore].filter(Boolean),
    retry: options.retry,
  });
}

/** @param {TrialPlan} plan */
async function printDryRun(plan, deps) {
  const { prompt } = await readScaffold(plan, deps);
  const { trial, id, scaffoldRev, branch, workdir, clone, evidencePath, agentArgv, fake } = plan;
  const printed = { trial, id, scaffoldRev, branch, workdir, clone, evidencePath, agentArgv, fake };
  console.log(JSON.stringify({ ...printed, promptSha256: sha256(prompt) }, null, 2));
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
  mkdirSync(plan.trialsRoot, { recursive: true });
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
