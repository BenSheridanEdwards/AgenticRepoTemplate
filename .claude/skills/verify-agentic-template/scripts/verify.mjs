#!/usr/bin/env node
/**
 * Launch, check, drive, and tear down one isolated instance of the template app
 * for verification. See `../SKILL.md` for the workflow and `../features/` for
 * the journeys this drives.
 *
 * Every run owns `.verify/<run-id>/`: `instance/` holds the server state that
 * `cleanup` removes, and `evidence/` holds the proof that outlives it.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { JOURNEYS } from './journeys.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../../..');
const VERIFY_ROOT = join(REPOSITORY_ROOT, '.verify');
const VITE_BIN = join(REPOSITORY_ROOT, 'node_modules/.bin/vite');
const APP_HEADING = 'Agentic Project Template';
const READY_TIMEOUT_MS = 60_000;

const runPaths = (runId) => {
  const root = join(VERIFY_ROOT, runId);
  return {
    root,
    instance: join(root, 'instance'),
    instanceFile: join(root, 'instance', 'instance.json'),
    serverLog: join(root, 'instance', 'server.log'),
    evidence: join(root, 'evidence'),
  };
};

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { positional: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token?.startsWith('--')) {
      options[token.slice(2)] = rest[index + 1];
      index += 1;
    } else {
      options.positional.push(token);
    }
  }
  return { command, options };
}

function requireRunId(options) {
  const runId = options.run ?? process.env.VERIFY_RUN_ID;
  if (!runId) {
    throw new Error('Pass --run <run-id> (printed by `launch`) or set VERIFY_RUN_ID.');
  }
  return runId;
}

function readInstance(runId) {
  const { instanceFile } = runPaths(runId);
  if (!existsSync(instanceFile)) {
    throw new Error(`No instance for run ${runId}. Launch one first.`);
  }
  return JSON.parse(readFileSync(instanceFile, 'utf8'));
}

function gitHead() {
  return spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  }).stdout.trim();
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandLineOf(pid) {
  return spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
}

/** True only for the Vite process this run spawned on this run's port. */
function ownsProcess(instance) {
  const commandLine = commandLineOf(instance.pid);
  return commandLine.includes('vite') && commandLine.includes(`--port ${instance.port}`);
}

async function probeHttp(url) {
  try {
    const page = await fetch(url);
    const api = await fetch(new URL('/api/service-status', url));
    const services = api.ok ? await api.json() : null;
    return { pageStatus: page.status, apiStatus: api.status, services };
  } catch (error) {
    return { error: String(error) };
  }
}

async function probeRender(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: APP_HEADING })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Service status' }).getByRole('listitem'),
    ).toHaveCount(3);
    return { rendered: true };
  } catch (error) {
    return { rendered: false, error: String(error).split('\n')[0] };
  } finally {
    await browser.close();
  }
}

async function launch(options) {
  const runId = options.run ?? `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const paths = runPaths(runId);
  if (existsSync(paths.instanceFile) && isAlive(readInstance(runId).pid)) {
    throw new Error(`Run ${runId} already has a live instance. Use doctor or cleanup.`);
  }
  mkdirSync(paths.instance, { recursive: true });
  mkdirSync(paths.evidence, { recursive: true });

  const port = Number(options.port ?? (await freePort()));
  const distDirectory = options.dist ? resolve(REPOSITORY_ROOT, options.dist) : undefined;
  if (distDirectory && !existsSync(join(distDirectory, 'index.html'))) {
    throw new Error(
      `${distDirectory} has no index.html. Build or download the dist artifact first.`,
    );
  }
  const mode = distDirectory ? 'preview' : 'dev';
  const viteArguments = distDirectory
    ? [
        'preview',
        '--outDir',
        distDirectory,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ]
    : ['--host', '127.0.0.1', '--port', String(port), '--strictPort'];

  const log = openSync(paths.serverLog, 'a');
  const server = spawn(VITE_BIN, viteArguments, {
    cwd: REPOSITORY_ROOT,
    detached: true,
    stdio: ['ignore', log, log],
  });
  server.unref();

  const url = `http://127.0.0.1:${port}/`;
  const instance = { runId, mode, url, port, pid: server.pid, distDirectory, gitHead: gitHead() };
  writeFileSync(paths.instanceFile, `${JSON.stringify(instance, null, 2)}\n`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isAlive(server.pid)) {
      throw new Error(`Server exited during startup. Read ${paths.serverLog}.`);
    }
    const probe = await probeHttp(url);
    if (probe.pageStatus === 200 && Array.isArray(probe.services)) {
      const render = await probeRender(url);
      if (render.rendered) {
        console.log(`READY run=${runId} mode=${mode} url=${url} pid=${server.pid}`);
        console.log(`evidence=${paths.evidence}`);
        return;
      }
    }
    await new Promise((wait) => setTimeout(wait, 500));
  }
  throw new Error(`Not ready after ${READY_TIMEOUT_MS} ms. Read ${paths.serverLog}, then cleanup.`);
}

async function doctor(options) {
  const runId = requireRunId(options);
  const instance = readInstance(runId);
  const http = await probeHttp(instance.url);
  const render = await probeRender(instance.url);
  const head = gitHead();
  const checks = [
    ['process alive', isAlive(instance.pid), `pid ${instance.pid}`],
    [
      'process is this run’s vite',
      ownsProcess(instance),
      commandLineOf(instance.pid) || 'no process',
    ],
    ['page answers 200', http.pageStatus === 200, http.error ?? `status ${http.pageStatus}`],
    [
      'service API answers',
      Array.isArray(http.services) && http.services.length === 3,
      http.error ?? `status ${http.apiStatus}, ${http.services?.length ?? 0} services`,
    ],
    ['app renders in Chromium', render.rendered, render.error ?? `heading "${APP_HEADING}"`],
    [
      'build matches HEAD',
      instance.mode === 'dev' ? instance.gitHead === head : true,
      instance.mode === 'dev'
        ? `launched at ${instance.gitHead.slice(0, 12)}, HEAD ${head.slice(0, 12)}`
        : `serving ${instance.distDirectory}`,
    ],
  ];
  for (const [name, passed, detail] of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  }
  console.log(`run=${runId} mode=${instance.mode} url=${instance.url}`);
  if (checks.some(([, passed]) => !passed)) {
    process.exitCode = 1;
  }
}

async function loadJourney(name) {
  if (JOURNEYS[name]) {
    return JOURNEYS[name];
  }
  const path = isAbsolute(name) ? name : resolve(process.cwd(), name);
  if (!existsSync(path)) {
    throw new Error(`Unknown journey "${name}". Known: ${Object.keys(JOURNEYS).join(', ')}.`);
  }
  return (await import(pathToFileURL(path).href)).default;
}

async function drive(options) {
  const runId = requireRunId(options);
  const instance = readInstance(runId);
  const [journeyName] = options.positional;
  if (!journeyName) {
    throw new Error(`Name a journey. Known: ${Object.keys(JOURNEYS).join(', ')}.`);
  }
  const journey = await loadJourney(journeyName);
  const output = join(runPaths(runId).evidence, journey.id);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: instance.url,
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: output, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const manifest = {
    journey: journey.id,
    feature: journey.feature,
    run: runId,
    mode: instance.mode,
    url: instance.url,
    gitHead: gitHead(),
    startedAt: new Date().toISOString(),
    steps: [],
    apiResponses: [],
    consoleErrors: [],
    pageErrors: [],
  };
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/')) {
      manifest.apiResponses.push(
        `${response.request().method()} ${response.url()} ${response.status()}`,
      );
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      manifest.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => manifest.pageErrors.push(String(error)));

  const step = async (name, body) => {
    const index = String(manifest.steps.length + 1).padStart(2, '0');
    const slug = `${index}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;
    try {
      await body();
      await page.screenshot({ path: join(output, `${slug}.png`), fullPage: true });
      writeFileSync(join(output, `${slug}.aria.yml`), await page.locator('main').ariaSnapshot());
      manifest.steps.push({ name, result: 'pass', screenshot: `${slug}.png` });
    } catch (error) {
      await page.screenshot({ path: join(output, `${slug}.failed.png`), fullPage: true });
      manifest.steps.push({ name, result: 'fail', error: String(error).split('\n')[0] });
      throw error;
    }
  };

  let failure;
  try {
    await journey.run({ page, step, expect, context: { output } });
  } catch (error) {
    failure = error;
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      await video.saveAs(join(output, 'video.webm'));
      await video.delete();
    }
    await browser.close();
    for (const helperVideo of readdirSync(output).filter((file) => file.startsWith('page@'))) {
      rmSync(join(output, helperVideo));
    }
  }
  if (manifest.pageErrors.length > 0 && !failure) {
    failure = new Error(`Uncaught page errors: ${manifest.pageErrors.join('; ')}`);
  }
  manifest.result = failure ? 'fail' : 'pass';
  manifest.finishedAt = new Date().toISOString();
  writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const { name, result, error } of manifest.steps) {
    console.log(`${result.toUpperCase()}  ${name}${error ? `  (${error})` : ''}`);
  }
  console.log(`${manifest.result.toUpperCase()} journey=${journey.id} evidence=${output}`);
  if (failure) {
    process.exitCode = 1;
  }
}

function cleanup(options) {
  const runId = requireRunId(options);
  const paths = runPaths(runId);
  if (!existsSync(paths.instanceFile)) {
    console.log(`No instance state for run ${runId}. Nothing to stop.`);
    return;
  }
  const instance = readInstance(runId);
  if (isAlive(instance.pid)) {
    if (!ownsProcess(instance)) {
      throw new Error(`pid ${instance.pid} is not this run’s vite. Not killing it.`);
    }
    process.kill(-instance.pid, 'SIGTERM');
    console.log(`Stopped pid ${instance.pid} (process group).`);
  }
  rmSync(paths.instance, { recursive: true, force: true });
  console.log(`Removed ${paths.instance}. Evidence kept at ${paths.evidence}.`);
}

const COMMANDS = { launch, doctor, drive, cleanup };

const { command, options } = parseArguments(process.argv.slice(2));
const handler = COMMANDS[command];
if (!handler) {
  console.error(`Usage: verify.mjs <${Object.keys(COMMANDS).join('|')}> [--run <run-id>] ...`);
  process.exit(2);
}
try {
  await handler(options);
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
