#!/usr/bin/env node
/**
 * Splits every job from a repository's recent CI runs into waiting, setup and
 * work (ADR 0116), so a change to CI shows its gain before any runner spend.
 *
 * CLI: `pnpm ci:audit owner/repo [runs] [--since ISO] [--until ISO] [--json]`
 * prints a Markdown or JSON summary. Reads the
 * token from GH_TOKEN, or from `gh auth token` when GH_TOKEN is unset.
 */

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { githubApi } from './github-api.mjs';

const SETUP_STEP =
  /set up job|checkout|setup|set up|install|cache|restore|pnpm store|toolchain|download artifact|initiali[sz]e/i;
const TEARDOWN_STEP = /^post |complete job|save .*cache|upload/i;
const SHARD_SUFFIX = /\s*\(?\d+\/\d+\)?/g;

const seconds = (from, to) => (from && to ? (Date.parse(to) - Date.parse(from)) / 1000 : 0);
const stepSeconds = (steps, matches) =>
  steps
    .filter(matches)
    .reduce((total, step) => total + seconds(step.started_at, step.completed_at), 0);

/** Waiting, setup, teardown and work seconds for one finished job, or null when it never ran. */
export function splitJob(job) {
  if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') return null;
  const steps = job.steps ?? [];
  const name = job.name.replace(SHARD_SUFFIX, ' (N)').trim();
  const selfHosted = (job.labels ?? []).includes('self-hosted');
  // A job cancelled before any runner took it has no runner and no steps: all waiting.
  if (steps.length === 0 && !job.runner_name) {
    const queue = Math.max(seconds(job.created_at, job.completed_at), 0);
    return { job: name, selfHosted, queue, setup: 0, teardown: 0, work: 0, total: 0 };
  }
  const total = Math.max(seconds(job.started_at, job.completed_at), 0);
  const setup = stepSeconds(
    steps,
    (step) => SETUP_STEP.test(step.name) && !TEARDOWN_STEP.test(step.name),
  );
  const teardown = stepSeconds(steps, (step) => TEARDOWN_STEP.test(step.name));
  return {
    job: name,
    selfHosted,
    queue: Math.max(seconds(job.created_at, job.started_at), 0),
    setup,
    teardown,
    work: Math.max(total - setup - teardown, 0),
    total,
  };
}

/** The value at fraction `p` of the sorted values; 0 for none. */
export function percentile(values, p) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const describe = (rows) => ({
  jobs: rows.length,
  queueP50: percentile(
    rows.map((row) => row.queue),
    0.5,
  ),
  queueP90: percentile(
    rows.map((row) => row.queue),
    0.9,
  ),
  setupP50: percentile(
    rows.map((row) => row.setup),
    0.5,
  ),
  workP50: percentile(
    rows.map((row) => row.work),
    0.5,
  ),
  workP90: percentile(
    rows.map((row) => row.work),
    0.9,
  ),
  runnerMinutes: rows.reduce((total, row) => total + row.total, 0) / 60,
});

/** Wall-clock seconds from a run's creation to its last finished job, or null when none ran. */
export function runWall(run, jobs) {
  const finished = jobs.filter((job) => job.completed_at && job.conclusion !== 'skipped');
  if (finished.length === 0) return null;
  const last = finished.map((job) => Date.parse(job.completed_at)).reduce((a, b) => Math.max(a, b));
  return (last - Date.parse(run.created_at)) / 1000;
}

/** The whole repository, each job name busiest first, and each workflow's pull request wall-clock. */
export function summarize(rows, runs = []) {
  const names = [...new Set(rows.map((row) => row.job))];
  const jobs = names
    .map((name) => ({ name, ...describe(rows.filter((row) => row.job === name)) }))
    .toSorted((a, b) => b.runnerMinutes - a.runnerMinutes);
  const prRuns = runs.filter((run) => run.event === 'pull_request' && run.wall !== null);
  const workflows = [...new Set(prRuns.map((run) => run.workflow))]
    .map((name) => {
      const walls = prRuns.filter((run) => run.workflow === name).map((run) => run.wall);
      return {
        name,
        runs: walls.length,
        wallP50: percentile(walls, 0.5),
        wallP90: percentile(walls, 0.9),
      };
    })
    .toSorted((a, b) => b.runs - a.runs);
  return { overall: describe(rows), jobs, workflows };
}

const whole = (value) => String(Math.round(value));

/** Markdown tables a pull request can quote as its before or after numbers. */
export function toMarkdown(repo, { overall, jobs, workflows = [] }) {
  const row = (name, s) =>
    `| ${name} | ${s.jobs} | ${whole(s.queueP50)} | ${whole(s.queueP90)} | ${whole(s.setupP50)} | ${whole(s.workP50)} | ${whole(s.workP90)} | ${whole(s.runnerMinutes)} |`;
  const wallRows = workflows.map(
    (w) => `| ${w.name} | ${w.runs} | ${whole(w.wallP50)} | ${whole(w.wallP90)} |`,
  );
  return [
    `### ${repo}`,
    '',
    '| Job | Runs | Wait p50 (s) | Wait p90 (s) | Setup p50 (s) | Work p50 (s) | Work p90 (s) | Runner-min |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    row('**All jobs**', overall),
    ...jobs.map((job) => row(job.name, job)),
    ...(wallRows.length === 0
      ? []
      : [
          '',
          '| Pull request workflow | Runs | Wall p50 (s) | Wall p90 (s) |',
          '| --- | --- | --- | --- |',
          ...wallRows,
        ]),
  ].join('\n');
}

/** Maps `items` through async `fn`, `size` at a time, so the API's secondary rate limit holds. */
export async function inBatches(items, size, fn) {
  const batches = Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
  return batches.reduce(
    async (done, batch) => [...(await done), ...(await Promise.all(batch.map(fn)))],
    Promise.resolve([]),
  );
}

/** The `created` filter for a window; empty when both ends are open. */
export function createdFilter({ since, until }) {
  const range =
    since && until ? `${since}..${until}` : since ? `>=${since}` : until ? `<=${until}` : '';
  return range ? `&created=${encodeURIComponent(range)}` : '';
}

/** Reads up to `runs` completed runs in the window and their jobs through `api`. */
export async function audit({ api, runs, since, until }) {
  const filter = createdFilter({ since, until });
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(runs / 100) }, (_, index) =>
      api(`actions/runs?status=completed&per_page=100&page=${index + 1}${filter}`),
    ),
  );
  const recent = pages.flatMap((page) => page.workflow_runs).slice(0, runs);
  const jobs = await inBatches(recent, 10, (run) =>
    api(`actions/runs/${run.id}/attempts/${run.run_attempt ?? 1}/jobs?per_page=100`),
  );
  return {
    rows: jobs.flatMap((page) => page.jobs.map(splitJob)).filter(Boolean),
    runs: recent.map((run, index) => ({
      workflow: run.name,
      event: run.event,
      wall: runWall(run, jobs[index].jobs),
    })),
  };
}

async function runCli() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { since: { type: 'string' }, until: { type: 'string' }, json: { type: 'boolean' } },
  });
  const [repo, runs = '150'] = positionals;
  if (!repo) {
    throw new Error('Usage: pnpm ci:audit owner/repo [runs] [--since ISO] [--until ISO] [--json]');
  }
  const token =
    process.env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const api = githubApi({ repo, token });
  const result = await audit({ api, runs: Number(runs), since: values.since, until: values.until });
  const summary = summarize(result.rows, result.runs);
  console.log(
    values.json
      ? JSON.stringify({ repo, since: values.since, until: values.until, ...summary }, null, 2)
      : toMarkdown(repo, summary),
  );
}

// realpath and pathToFileURL keep the guard true for symlinked or spaced paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
