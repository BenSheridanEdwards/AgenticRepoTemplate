#!/usr/bin/env node
/**
 * Runs one brief's trial end to end and records its evidence (ADR 0034).
 *
 *   node tooling/trial/run-trial.mjs --trial <1|2|3> --scaffold <rev>
 *     [--agent claude|codex] [--task <file>] [--trials-root <dir>]
 *     [--dry-run] [--retry] [--agent-command <path>]
 *
 * It clones the invoking checkout at the scaffold revision into a fresh
 * workdir, runs one fresh Claude session on the fixed prompt, commits the
 * result, runs every check on a clean clone of that commit and writes
 * `docs/trials/<id>.json` (plus a patch when the run fails) into the invoking
 * checkout. Each command that runs the trial's code gets a private temp and
 * cache folder inside the workdir, with the temp folder mounted over `/tmp`
 * by bubblewrap, and none runs under a time limit (ADR 0038). It never deletes the workdir; it prints the path for whoever runs the
 * next trial.
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
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvidence } from './evidence.mjs';
import { findOutsideReads, redactSecrets, streamEvents, summarizeStream } from './stream.mjs';
import { agentEnv, checkEnv, stopAll, systemDeps, trialEnv } from './system.mjs';
import { loadTask, TODO_TASK, validateTask, withinPaths } from './task.mjs';

const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const LOCKFILE = 'pnpm-lock.yaml';
const SIGN_OFF = 'Signed-off-by: Ben Sheridan-Edwards <bensheridanedwards@gmail.com>';
const MIN_FREE_DISK_BYTES = 5e9;
const OUTPUT_TAIL_LINES = 200;
/** The files that make up the harness, hashed into `harness.sha256`. */
const HARNESS_FILES = [
  'run-trial.mjs',
  'evidence.mjs',
  'stream.mjs',
  'system.mjs',
  'task.mjs',
  'check-scope.mjs',
  'tasks/todo.json',
  'tasks/notes.json',
];

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

/**
 * The temp and cache variables every trial command gets, each naming a folder
 * inside the workdir (ADR 0038), so no tool the agent or a check runs reads or
 * writes the shared `/tmp` or `~/.cache`. The `TMPDIR` folder is also mounted
 * over `/tmp`, so a command that names `/tmp` reaches it too. `CLAUDE_CODE_TMPDIR` also keeps
 * Claude Code's sandboxed commands off their `/tmp/claude` default. The
 * checks get their own `check-` folders, so nothing the agent left in its
 * temp or cache folder reaches them.
 */
const PRIVATE_ENV = {
  TMPDIR: 'tmp',
  TMP: 'tmp',
  TEMP: 'tmp',
  CLAUDE_CODE_TMPDIR: 'tmp',
  XDG_RUNTIME_DIR: 'tmp',
  XDG_CACHE_HOME: 'cache',
  npm_config_cache: 'cache/npm',
};

/** What the agent loads from its user-level config folder, hashed into `userConfigSha256`. */
const CODEX_CONFIG_ENTRIES = [
  'config.toml',
  'AGENTS.md',
  'hooks.json',
  'rules',
  'skills',
  'plugins',
];
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
 * @typedef {{ name: string, argv: readonly string[] }} Command
 * @typedef {{
 *   task: object, taskDir: string, promptFile?: string, agentName: 'claude' | 'codex', codexHome: string, targetRepo: string, sessionTranscript?: string,
 *   trial: 1 | 2 | 3, id: string, scaffoldRev: string, root: string, trialsRoot: string,
 *   workdir: string, origin: string, clone: string, checkClone: string, branch: string,
 *   evidencePath: string, patchPath: string, keptStreamPath: string, promptPath: string, streamPath: string,
 *   sessionId: string | null, agentArgv: readonly string[], fake: boolean, retry: boolean,
 *   claudeConfigDir: string, claudeStateFile: string,
 *   privateEnv: Readonly<Record<string, string>>, checkPrivateEnv: Readonly<Record<string, string>>,
 *   sharedCaches: readonly string[], sharedTmp: string,
 *   ports: readonly number[], setup: readonly Command[], checks: readonly Command[],
 * }} TrialPlan
 * @typedef {{ code: number, stdout: string, output: string, ms: number }} ExecResult
 * @typedef {{ folder: string, over: string, keep: readonly string[] }} PrivateTmp
 *   A command's own temp folder, mounted over the shared `over`, and the
 *   paths under `over` it still needs: its workdir and its executable.
 * @typedef {{
 *   exec: (argv: readonly string[], options: { cwd: string, input?: string, stdoutFile?: string, env?: NodeJS.ProcessEnv, privateTmp?: PrivateTmp }) => Promise<ExecResult>,
 *   now: () => Date,
 *   freeDiskBytes: (path: string) => number,
 *   isPortBusy: (port: number) => Promise<boolean>,
 *   stopListeners: (port: number) => Promise<void>,
 * }} Deps
 * @typedef {import('./evidence.mjs').TrialEvidence} TrialEvidence
 */

/**
 * @param {{
 *   agent?: 'claude' | 'codex', task?: object, taskDir?: string, promptFile?: string, codexHome?: string,
 *   trial: number, scaffoldRev: string, root: string, trialsRoot: string, now: Date,
 *   sessionId: string, agentCommand?: string, claudeConfigDir: string, claudeStateFile?: string,
 *   corepackHome: string, browsersPath: string, pnpmStore?: string | null,
 *   sharedTmp?: string, retry: boolean,
 * }} options
 *   `corepackHome`, `browsersPath` and `pnpmStore` are the shared caches the
 *   trial's commands still read: the pinned pnpm, the Playwright browsers and
 *   the package store. `sharedTmp` is the box's temp folder, `/tmp` unless a
 *   test names another, which each trial command sees as its own.
 * @returns {TrialPlan}
 */
export function planTrial(options) {
  const { trial, scaffoldRev, root, trialsRoot, now, sessionId, agentCommand } = options;
  if (![1, 2, 3].includes(trial)) {
    throw new Error(`--trial must be 1, 2 or 3, got ${trial}`);
  }
  if (!/^[0-9a-f]{40}$/.test(scaffoldRev)) {
    throw new Error(`--scaffold must name a full 40-hex commit, got ${scaffoldRev}`);
  }
  const agentName = options.agent ?? 'claude';
  if (!['claude', 'codex'].includes(agentName)) throw new Error('--agent must be claude or codex');
  const task = validateTask(options.task ?? TODO_TASK);
  validateEvidenceDirectory(task, root);
  const id = `${task.name}${agentName === 'claude' ? '' : `-${agentName}`}-0${trial}`;
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
  const workdir = join(trialsRoot, `${id}-${stamp}`);
  const evidenceDir = task.evidenceDir ?? join(root, 'docs/trials');
  return {
    ...taskContext(task, options),
    agentName,
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
    evidencePath: join(evidenceDir, `${id}.json`),
    patchPath: join(evidenceDir, `${id}.patch`),
    keptStreamPath: join(evidenceDir, `${id}.stream.jsonl`),
    promptPath: join(workdir, 'prompt.md'),
    streamPath: join(workdir, 'agent.stream.jsonl'),
    sessionId,
    agentArgv: agentArguments(agentName, agentCommand, workdir, sessionId),
    fake: agentCommand !== undefined,
    retry: options.retry,
    ...runtimePlan(options, workdir),
    ...taskCommands(task, options.taskDir ?? HARNESS_ROOT, id),
  };
}

/** External evidence stays outside the invoking checkout, including through symlinks. */
function validateEvidenceDirectory(task, root) {
  if (!task.target) return;
  let ancestor = resolve(task.evidenceDir);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const evidenceRoot = resolve(realpathSync(ancestor), relative(ancestor, task.evidenceDir));
  const checkoutRoot = realpathSync(root);
  if (evidenceRoot === checkoutRoot || withinPaths(evidenceRoot, [checkoutRoot]))
    throw new Error('task.evidenceDir: expected a directory outside the invoking checkout');
}

function runtimePlan(options, workdir) {
  return {
    claudeConfigDir: options.claudeConfigDir,
    claudeStateFile:
      options.claudeStateFile ?? join(dirname(options.claudeConfigDir), '.claude.json'),
    privateEnv: privateEnvIn(workdir, '', options),
    checkPrivateEnv: privateEnvIn(workdir, 'check-', options),
    sharedCaches: [
      options.corepackHome,
      options.browsersPath,
      ...(options.pnpmStore ? [options.pnpmStore] : []),
    ],
    sharedTmp: options.sharedTmp ?? '/tmp',
  };
}

function taskCommands(task, taskDir, id) {
  return {
    ports: task.ports ?? [],
    setup: task.setup,
    checks: [...task.checks, ...(task.acceptance ?? [])].map((command) => ({
      ...command,
      argv: command.argv.map((arg) =>
        arg.replaceAll('{{TASK_DIR}}', taskDir).replaceAll('{{ID}}', id),
      ),
    })),
  };
}

function taskContext(task, options) {
  return {
    task,
    taskDir: options.taskDir ?? HARNESS_ROOT,
    promptFile: options.promptFile,
    codexHome: options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex'),
    targetRepo: task.target?.repo ?? options.root,
  };
}

function agentArguments(agentName, agentCommand, workdir, sessionId) {
  return agentName === 'claude'
    ? [agentCommand ?? 'claude', ...AGENT_FLAGS, sessionId]
    : [
        agentCommand ?? 'codex',
        'exec',
        '--json',
        '--dangerously-bypass-approvals-and-sandbox',
        '--dangerously-bypass-hook-trust',
        '-m',
        'gpt-6.1-sol',
        '-c',
        'allow_login_shell=false',
        '-c',
        `projects.${JSON.stringify(join(workdir, 'repo'))}.trust_level="trusted"`,
        '-C',
        join(workdir, 'repo'),
        '-',
      ];
}

/**
 * `PRIVATE_ENV` with each folder under `workdir`, its name after `prefix`, and
 * the shared caches.
 *
 * @param {string} workdir
 * @param {string} prefix
 * @param {{ corepackHome: string, browsersPath: string }} shared
 */
function privateEnvIn(workdir, prefix, { corepackHome, browsersPath }) {
  return {
    ...Object.fromEntries(
      Object.entries(PRIVATE_ENV).map(([name, folder]) => [name, join(workdir, prefix + folder)]),
    ),
    COREPACK_HOME: corepackHome,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  };
}

/**
 * The exec options of a command that runs the trial's code: temp and runtime
 * variables name the short mount path to leave room for Unix socket names.
 * The backing `TMPDIR` folder of `privateEnv` is mounted over `/tmp`, keeping the
 * workdir and an agent named by path in view.
 *
 * @param {TrialPlan} plan
 * @param {NodeJS.ProcessEnv} env
 * @param {Readonly<Record<string, string>>} privateEnv
 */
function confined(plan, env, privateEnv) {
  return {
    env: {
      ...env,
      ...Object.fromEntries(
        Object.entries(PRIVATE_ENV)
          .filter(([, folder]) => folder === 'tmp')
          .map(([name]) => [name, plan.sharedTmp]),
      ),
    },
    privateTmp: {
      folder: privateEnv.TMPDIR,
      over: plan.sharedTmp,
      keep: [plan.workdir, plan.agentArgv[0]].filter((path) => path.startsWith('/')),
    },
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
  const shown = await deps.exec(['git', 'show', `${plan.scaffoldRev}:${path}`], {
    cwd: plan.task.target ? plan.origin : plan.root,
  });
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
  const { template, lockfile } = await scaffoldInputs(plan, deps);
  const enforcementRev = await enforcementRevision(plan, deps);
  return {
    template,
    prompt: renderPrompt(template, plan),
    lockfile,
    enforcementRev: enforcementRev || plan.scaffoldRev,
    harness: await readHarness(plan, deps),
  };
}

async function scaffoldInputs(plan, deps) {
  const template = plan.promptFile
    ? readFileSync(plan.promptFile, 'utf8')
    : await atScaffold(plan, deps, plan.task.prompt);
  const lockfile =
    (await atScaffold(plan, deps, LOCKFILE)) ??
    (plan.task.target || plan.task.land !== 'showcase' ? '' : null);
  for (const [path, text] of [
    [plan.task.prompt, template],
    [LOCKFILE, lockfile],
  ]) {
    if (text === null) {
      throw new Error(`The scaffold ${plan.scaffoldRev} has no ${path}.`);
    }
  }
  return { template, lockfile };
}

async function enforcementRevision(plan, deps) {
  const enforcementRev =
    (plan.task.enforcementPaths?.length ?? 0) === 0
      ? plan.scaffoldRev
      : await git(
          deps,
          plan.task.target ? plan.origin : plan.root,
          'log',
          '-1',
          '--format=%H',
          plan.scaffoldRev,
          '--',
          ...(plan.task.enforcementPaths ?? []),
        );
  return enforcementRev || plan.scaffoldRev;
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
async function prepareOrigin(plan, deps) {
  await git(deps, plan.workdir, 'init', '-q', '--bare', '--initial-branch=main', plan.origin);
  await git(
    deps,
    plan.origin,
    'fetch',
    '-q',
    '--no-tags',
    '--upload-pack',
    'git -c uploadpack.allowAnySHA1InWant=true upload-pack',
    plan.targetRepo,
    `${plan.scaffoldRev}:refs/heads/main`,
  );
  // FETCH_HEAD would name the evidence checkout inside the agent's workdir.
  rmSync(join(plan.origin, 'FETCH_HEAD'), { force: true });
  await git(deps, plan.origin, 'config', 'uploadpack.allowFilter', 'true');
}

async function prepareClone(plan, deps) {
  if (!plan.task.target) await prepareOrigin(plan, deps);
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
  if (plan.task.land === 'showcase' && results.length > 0) {
    throw new Error(`the scaffold already holds showcase results: ${results.join(', ')}`);
  }
}

/**
 * @param {readonly Command[]} commands
 * @param {string} cwd
 * @param {Deps} deps
 * @param {ReturnType<typeof confined>} options
 */
async function runCommands(commands, cwd, deps, options) {
  const records = [];
  for (const command of commands) {
    const run = await deps.exec(command.argv, { cwd, ...options });
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
  return plan.checks
    .filter(({ name }) => plan.task.checks.some((check) => check.name === name))
    .flatMap(({ name, argv: [tool, entry] }) => {
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
function fingerprint(root, path, excludeCredentials = false) {
  if (
    excludeCredentials &&
    /(?:^|[/.])(?:auth|credentials?|secrets?|tokens?)(?:[/.]|$)|(?:^|\/)\.(?:env|npmrc|netrc|git-credentials|pypirc)(?:\.|$)|\.(?:pem|key|p12|pfx)$/i.test(
      path,
    )
  )
    return [];
  const full = join(root, path);
  if (!existsSync(full)) {
    return [];
  }
  if (statSync(full).isDirectory()) {
    return readdirSync(full)
      .sort()
      .flatMap((entry) => fingerprint(root, join(path, entry), excludeCredentials));
  }
  return [`${path}\0${sha256(readFileSync(full))}`];
}

/** @param {TrialPlan} plan */
function userConfigSha256(plan) {
  if (plan.agentName === 'codex') {
    return sha256(
      CODEX_CONFIG_ENTRIES.flatMap((entry) => fingerprint(plan.codexHome, entry, true)).join('\n'),
    );
  }
  const files = USER_CONFIG_ENTRIES.flatMap((entry) => fingerprint(plan.claudeConfigDir, entry));
  const state = existsSync(plan.claudeStateFile)
    ? JSON.parse(readFileSync(plan.claudeStateFile, 'utf8'))
    : {};
  const mcpServers = JSON.stringify(state.mcpServers ?? null);
  return sha256([...files, `mcpServers\0${sha256(mcpServers)}`].join('\n'));
}

/** The lockfile without the importer entries of this trial's two packages. */
export function withoutOwnImporters(lockfile, id) {
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
 * @param {Pick<TrialPlan, 'id' | 'clone' | 'scaffoldRev' | 'task'>} plan
 * @param {string} scaffoldLockfile
 * @param {Deps} deps
 */
export async function inspectChanges(plan, scaffoldLockfile, deps) {
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
    !plan.task.target && plan.task.land === 'showcase' && path === LOCKFILE
      ? !lockfileInScope
      : !withinPaths(
          path,
          plan.task.allowedPaths.map((prefix) => renderPrompt(prefix, plan)),
        ),
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
  const changed = (await inspectChanges(plan, '', deps)).changedPaths;
  const prefixes = (plan.task.resultPaths ?? plan.task.allowedPaths).map((prefix) =>
    renderPrompt(prefix, plan),
  );
  const paths = changed.filter(
    (path) =>
      (withinPaths(path, prefixes) &&
        withinPaths(
          path,
          plan.task.allowedPaths.map((prefix) => renderPrompt(prefix, plan)),
        )) ||
      (!plan.task.target && plan.task.land === 'showcase' && path === LOCKFILE),
  );
  if (paths.length > 0) {
    await git(deps, plan.clone, 'add', '-A', '--', ...paths);
  }
  const staged = await git(deps, plan.clone, 'diff', '--cached', '--name-only');
  if (staged === '') {
    return {
      commit: null,
      failure: plan.task.target
        ? 'the agent left no change inside resultPaths and allowedPaths'
        : `the agent left no change under showcase/${plan.id}/`,
    };
  }
  const commit = await deps.exec(
    [
      'git',
      '-c',
      'user.name=Ben Sheridan-Edwards',
      '-c',
      'user.email=bensheridanedwards@gmail.com',
      'commit',
      '-q',
      '-m',
      renderPrompt(plan.task.commitMessage ?? 'feat(showcase): add {{ID}} trial result', plan),
      '-m',
      `Trial ${plan.trial} of the ${plan.task.land === 'showcase' ? plan.task.name.replace(/^./, (letter) => letter.toUpperCase()) : plan.task.name} trials at scaffold ${plan.scaffoldRev}.\n\n${SIGN_OFF}`,
    ],
    { cwd: plan.clone, ...confined(plan, trialEnv(plan.privateEnv), plan.privateEnv) },
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
  if (!existsSync(join(plan.clone, '.git')) && plan.task.land === 'patch') {
    mkdirSync(dirname(plan.patchPath), { recursive: true });
    writeFileSync(plan.patchPath, '');
    return plan.task.evidenceDir ? plan.patchPath : relative(plan.root, plan.patchPath);
  }
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
  if (patch === '' && plan.task.land !== 'patch') {
    return null;
  }
  mkdirSync(dirname(plan.patchPath), { recursive: true });
  writeFileSync(plan.patchPath, `${patch}\n`);
  return plan.task.evidenceDir ? plan.patchPath : relative(plan.root, plan.patchPath);
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

/**
 * Installs the clone and reads the agent's version. First it checks that
 * bubblewrap can mount the private temp folder over `/tmp`, and stops the run
 * when it cannot, so no trial ever runs on the shared `/tmp`.
 *
 * @param {RunState} state
 */
async function setupStage({ plan, deps, failures, agent }) {
  const options = confined(plan, trialEnv(plan.privateEnv), plan.privateEnv);
  const probe = await deps.exec(['true'], { cwd: plan.clone, ...options });
  if (probe.code !== 0) {
    failures.push(
      `bubblewrap could not give the trial a private /tmp (exit ${probe.code}): ${probe.output.trim()}. Install bubblewrap (bwrap) and allow unprivileged user namespaces; the harness runs no trial on the shared /tmp.`,
    );
    return;
  }
  for (const setup of await runCommands(plan.setup, plan.clone, deps, options)) {
    if (setup.exitCode !== 0) {
      failures.push(`setup ${setup.name} exited ${setup.exitCode}`);
    }
  }
  if (!plan.task.target) failures.push(...missingCheckEntries(plan));
  const version = await deps.exec([plan.agentArgv[0], '--version'], {
    cwd: plan.clone,
    ...confined(plan, agentEnv(plan.privateEnv), plan.privateEnv),
  });
  if (version.code !== 0) {
    failures.push(
      `${plan.agentArgv[0]} --version exited ${version.code}: ${version.output.trim()}`,
    );
  }
  return {
    agent: { ...agent, version: version.stdout.trim(), userConfigSha256: userConfigSha256(plan) },
  };
}

/**
 * Where the agent may read (ADR 0034, 0038): its workdir, which holds its
 * private temp and cache folders, `/tmp`, which is that temp folder inside
 * bubblewrap, the Claude config it loads, its own session folder under the
 * config's `projects/`, and the shared caches. The trials root and every
 * other session's folder stay denied, even inside an allowed root.
 *
 * @param {TrialPlan} plan
 */
function readScope(plan) {
  if (plan.agentName === 'codex')
    return {
      clone: plan.clone,
      allowedRoots: [
        plan.workdir,
        plan.sharedTmp,
        ...plan.sharedCaches,
        ...CODEX_CONFIG_ENTRIES.map((entry) => join(plan.codexHome, entry)),
        ...(plan.sessionTranscript ? [plan.sessionTranscript] : []),
      ],
      deniedRoots: [plan.trialsRoot, join(plan.codexHome, 'sessions'), plan.taskDir],
    };
  const slug = plan.clone.replace(/[^a-zA-Z0-9]/g, '-');
  const projects = join(plan.claudeConfigDir, 'projects');
  return {
    clone: plan.clone,
    allowedRoots: [
      plan.workdir,
      plan.sharedTmp,
      ...USER_CONFIG_ENTRIES.map((entry) => join(plan.claudeConfigDir, entry)),
      join(plan.claudeConfigDir, 'plugins'),
      join(projects, slug, plan.sessionId),
      ...plan.sharedCaches,
    ],
    deniedRoots: [plan.trialsRoot, projects, plan.taskDir],
  };
}

/**
 * Runs the one agent session. Before it starts, a provisional record marks
 * the trial as run (`agentExitCode: -1`), so a harness stopped mid-session
 * still leaves a failed record that `--retry` refuses.
 *
 * @param {RunState} state
 */
async function agentStage(state) {
  const { plan, deps, scaffold, failures, run, result } = state;
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
    stdoutFile: plan.streamPath,
    ...confined(plan, agentEnv(plan.privateEnv), plan.privateEnv),
  });
  run.agentExitCode = session.code;
  run.agentDurationMs = session.ms;
  if (session.code !== 0) {
    failures.push(`agent exited ${session.code}`);
  }
  const streamText = readFileSync(plan.streamPath, 'utf8');
  const events = streamEvents(streamText);
  const { userTextEvents, plan: sessionPlan } = recordSessionSummary(state, events);
  const kept = redactSecrets(streamText, process.env);
  mkdirSync(dirname(plan.keptStreamPath), { recursive: true });
  writeFileSync(plan.keptStreamPath, kept);
  const stream = {
    path: plan.task.evidenceDir ? plan.keptStreamPath : relative(plan.root, plan.keptStreamPath),
    sha256: sha256(kept),
    userTextEvents,
  };
  result.outsideReads = findOutsideReads(events, readScope(sessionPlan));
  if (result.outsideReads.length > 0) {
    failures.push(`named paths outside the clone: ${result.outsideReads.join(', ')}`);
  }
  return { stream, plan: sessionPlan };
}

function recordSessionSummary({ plan, agent, run, failures }, events) {
  const summary = summarizeStream(events, plan.agentName, { codexHome: plan.codexHome });
  const { resolvedModel, turns, costUsd, userTextEvents } = summary;
  if (
    plan.agentName === 'codex' &&
    (events.some((event) => event.type === 'turn.failed') || summary.sessionId === null)
  )
    failures.push('Codex did not finish a valid thread');
  const sessionPlan =
    plan.agentName === 'codex'
      ? { ...plan, sessionId: summary.sessionId, sessionTranscript: summary.transcriptPath }
      : plan;
  Object.assign(agent, {
    resolvedModel,
    modelSource: summary.modelSource ?? 'stream',
    reasoningEffort: summary.reasoningEffort ?? null,
  });
  Object.assign(run, { turns, costUsd, tokenUsage: summary.tokenUsage ?? null });
  return { userTextEvents, plan: sessionPlan };
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
    failures.push(
      `changed outside ${plan.task.target ? 'allowedPaths' : `showcase/${plan.id}/`}: ${result.outsideScope.join(', ')}`,
    );
  }
  await rewindToScaffold(plan, deps);
  const committed = await commitResult(plan, deps);
  if (committed.failure) {
    failures.push(committed.failure);
  }
  return { result: { ...result, commit: committed.commit } };
}

/**
 * Runs the checks on a fresh clone of the result commit, with CI's
 * environment and their own temp and cache folders, so they see exactly what
 * was committed and nothing the agent left behind. The agent can reach the
 * workdir, so a check folder it already filled fails the run unchecked.
 *
 * @param {RunState} state
 */
async function checksStage(state) {
  const { plan, deps, failures, result } = state;
  if (result.commit === null) {
    return;
  }
  const folders = [...new Set(Object.keys(PRIVATE_ENV).map((name) => plan.checkPrivateEnv[name]))];
  const filled = folders.filter((folder) => existsSync(folder));
  if (filled.length > 0) {
    failures.push(
      ...filled.map(
        (folder) =>
          `the agent wrote into ${relative(plan.workdir, folder)}, the checks' private folder`,
      ),
    );
    return;
  }
  for (const folder of folders) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
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
  const checks = await runCommands(plan.checks, plan.checkClone, deps, {
    ...confined(plan, checkEnv(plan.checkPrivateEnv), plan.checkPrivateEnv),
    privateTmp: {
      ...confined(plan, checkEnv(plan.checkPrivateEnv), plan.checkPrivateEnv).privateTmp,
      keep: [
        ...confined(plan, checkEnv(plan.checkPrivateEnv), plan.checkPrivateEnv).privateTmp.keep,
        ...(plan.task.acceptance?.length ? [plan.taskDir] : []),
      ],
    },
  });
  for (const check of checks.filter(({ exitCode }) => exitCode !== 0)) {
    failures.push(`check ${check.name} exited ${check.exitCode}`);
  }
  for (const name of plan.checks
    .map(({ name }) => name)
    .filter((required) => checks.every((check) => check.name !== required))) {
    failures.push(`check ${name} did not run`);
  }
  return { checks };
}

/**
 * The run protocol in order. A stage marked `beforeAgent` stops the run on
 * its first failure, so a broken setup never reaches the agent; after the
 * agent, every stage runs, so a failed run still records all it can. A stage
 * with `stopped` runs with no time limit, so a record naming it as the
 * failure is written before it starts, in case the operator stops the harness.
 */
const STAGES = [
  { run: ({ plan, deps }) => prepareClone(plan, deps), beforeAgent: true },
  { run: setupStage, beforeAgent: true },
  { run: agentStage, beforeAgent: false },
  {
    run: resultStage,
    beforeAgent: false,
    stopped: 'the harness stopped while the commit hooks ran',
  },
  {
    run: strayServerStage,
    beforeAgent: false,
    stopped: 'the harness stopped while it looked for servers the agent left',
  },
  { run: checksStage, beforeAgent: false, stopped: 'the harness stopped while the checks ran' },
];

/** @param {RunState} state */
async function runStages(state) {
  let current = state;
  for (const stage of STAGES) {
    try {
      if (stage.stopped) {
        const failures = [...current.failures, stage.stopped];
        await writeEvidence(
          current.plan,
          toEvidence({ ...current, failures }, current.deps.now()),
          current.deps,
        );
      }
      current = { ...current, ...(await stage.run(current)) };
    } catch (error) {
      current.failures.push(`harness: ${error instanceof Error ? error.message : String(error)}`);
      return current;
    }
    if (stage.beforeAgent && current.failures.length > 0) {
      return current;
    }
  }
  return current;
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
    schema: 2,
    task: {
      name: plan.task.name,
      definitionSha256: sha256(JSON.stringify(plan.task)),
      target: plan.task.target ?? null,
      checks: plan.checks.map(({ name }) => name),
      land: plan.task.land,
    },
    trial: {
      number: plan.trial,
      id: plan.id,
      branch: plan.branch,
      workdir: basename(plan.workdir),
    },
    prompt: {
      path: plan.task.prompt,
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
      name: plan.agentName,
      modelSource: agent.modelSource ?? null,
      reasoningEffort: agent.reasoningEffort ?? null,
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
      tokenUsage: run.tokenUsage ?? null,
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
  const retries = await checkPreconditions(plan, deps);
  const startedAt = deps.now();
  const { scaffold, preparationFailure } = await prepareScaffold(plan, deps);
  for (const name of Object.keys(PRIVATE_ENV)) {
    mkdirSync(plan.privateEnv[name], { recursive: true, mode: 0o700 });
  }
  /** @type {RunState} */
  const initialState = {
    plan,
    deps,
    scaffold,
    startedAt,
    retries,
    failures: preparationFailure ? [preparationFailure] : [],
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
  const state = preparationFailure ? initialState : await runStages(initialState);
  if (
    (state.failures.length > 0 && state.run.agentExitCode !== null) ||
    plan.task.land === 'patch'
  ) {
    state.result.patch = await writePatch(plan, deps);
  }
  const evidence = toEvidence(state, deps.now());
  await writeEvidence(plan, evidence, deps);
  return validateEvidence(evidence);
}

async function prepareScaffold(plan, deps) {
  let scaffold;
  let preparationFailure = null;
  if (plan.task.target) {
    const template = readFileSync(plan.promptFile, 'utf8');
    mkdirSync(plan.workdir, { recursive: true });
    try {
      await prepareOrigin(plan, deps);
      scaffold = await readScaffold(plan, deps);
    } catch (error) {
      preparationFailure = `harness: ${error instanceof Error ? error.message : String(error)}`;
      scaffold = {
        template,
        prompt: renderPrompt(template, plan),
        lockfile: '',
        enforcementRev: plan.scaffoldRev,
        harness: await readHarness(plan, deps),
      };
    }
  } else {
    scaffold = await readScaffold(plan, deps);
  }
  return { scaffold, preparationFailure };
}

export { systemDeps };

function parseArguments(argv) {
  const options = { dryRun: false, retry: false };
  const valued = {
    '--trial': 'trial',
    '--scaffold': 'scaffold',
    '--trials-root': 'trialsRoot',
    '--agent-command': 'agentCommand',
    '--agent': 'agent',
    '--task': 'task',
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
  if (
    options.trial === undefined ||
    (options.scaffold === undefined && options.task === undefined)
  ) {
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

/** Where `path` really is, through any symlink, once it exists. */
const located = (path) => (existsSync(path) ? realpathSync(path) : resolve(path));

/**
 * A shared cache from the caller's environment, which must really sit inside
 * `~/.cache`, symlinks followed, so the read allowlist never reaches past
 * what ADR 0034 allowed.
 */
function sharedCache(name, path) {
  const bound = join(homedir(), '.cache');
  if (!located(path).startsWith(`${located(bound)}/`)) {
    throw new Error(`${name} must name a folder inside ${bound}, got ${JSON.stringify(path)}.`);
  }
  return resolve(path);
}

function planFromArguments(options) {
  const loaded = options.task ? loadTask(options.task) : { task: TODO_TASK };
  const { root, scaffoldRev } = checkoutForTask(options, loaded.task);
  const configDirFromEnv = process.env.CLAUDE_CONFIG_DIR;
  const claudeConfigDir = configDirFromEnv ?? join(homedir(), '.claude');
  const userCache = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return planTrial({
    ...loaded,
    agent: options.agent,
    trial: Number(options.trial),
    scaffoldRev,
    root,
    trialsRoot: resolve(options.trialsRoot ?? join(root, '..', 'trials')),
    now: new Date(),
    sessionId: randomUUID(),
    agentCommand: options.agentCommand && resolve(options.agentCommand),
    claudeConfigDir,
    claudeStateFile: configDirFromEnv && join(configDirFromEnv, '.claude.json'),
    ...sharedCacheOptions(userCache),
    pnpmStore: output(['pnpm', 'store', 'path'], root),
    retry: options.retry,
  });
}

function checkoutForTask(options, task) {
  const { root, scaffoldRev: checkoutRev } = resolveCheckout(
    task.target ? 'HEAD' : options.scaffold,
  );
  const scaffoldRev = task.target?.rev ?? checkoutRev;
  if (task.target && options.scaffold && options.scaffold !== scaffoldRev)
    throw new Error('--scaffold must equal task.target.rev');
  return { root, scaffoldRev };
}

function sharedCacheOptions(userCache) {
  return {
    corepackHome: sharedCache(
      'COREPACK_HOME',
      process.env.COREPACK_HOME ?? join(userCache, 'node/corepack'),
    ),
    browsersPath: sharedCache(
      'PLAYWRIGHT_BROWSERS_PATH',
      process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(userCache, 'ms-playwright'),
    ),
  };
}

/** The plan fields a dry run prints. */
const DRY_RUN_FIELDS = /** @type {const} */ ([
  'trial',
  'id',
  'scaffoldRev',
  'branch',
  'workdir',
  'clone',
  'evidencePath',
  'agentArgv',
  'fake',
  'privateEnv',
  'checkPrivateEnv',
]);

/** @param {TrialPlan} plan */
async function printDryRun(plan, deps) {
  const { prompt, harness } = plan.task.target
    ? {
        prompt: renderPrompt(readFileSync(plan.promptFile, 'utf8'), plan),
        harness: { sha256: null, matchesScaffold: false },
      }
    : await readScaffold(plan, deps);
  const printed = Object.fromEntries(DRY_RUN_FIELDS.map((field) => [field, plan[field]]));
  console.log(
    JSON.stringify(
      {
        ...printed,
        confinedEnv: confined(plan, plan.privateEnv, plan.privateEnv).env,
        checkConfinedEnv: confined(plan, plan.checkPrivateEnv, plan.checkPrivateEnv).env,
        promptSha256: sha256(prompt),
        harness,
      },
      null,
      2,
    ),
  );
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
