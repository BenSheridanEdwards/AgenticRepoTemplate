#!/usr/bin/env node
/**
 * Splits every job from a repository's recent CI runs into waiting, setup and
 * work (ADR 0110), so a change to CI shows its gain before any runner spend.
 *
 * CLI: `pnpm ci:audit owner/repo [runs]` prints a Markdown summary. Reads the
 * token from GH_TOKEN, or from `gh auth token` when GH_TOKEN is unset.
 */

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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
  const total = seconds(job.started_at, job.completed_at);
  const setup = stepSeconds(
    steps,
    (step) => SETUP_STEP.test(step.name) && !TEARDOWN_STEP.test(step.name),
  );
  const teardown = stepSeconds(steps, (step) => TEARDOWN_STEP.test(step.name));
  return {
    job: job.name.replace(SHARD_SUFFIX, ' (N)').trim(),
    selfHosted: (job.labels ?? []).includes('self-hosted'),
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

/** The whole repository plus each job name, busiest first. */
export function summarize(rows) {
  const names = [...new Set(rows.map((row) => row.job))];
  const jobs = names
    .map((name) => ({ name, ...describe(rows.filter((row) => row.job === name)) }))
    .toSorted((a, b) => b.runnerMinutes - a.runnerMinutes);
  return { overall: describe(rows), jobs };
}

const whole = (value) => String(Math.round(value));

/** A Markdown table a pull request can quote as its before or after numbers. */
export function toMarkdown(repo, { overall, jobs }) {
  const row = (name, s) =>
    `| ${name} | ${s.jobs} | ${whole(s.queueP50)} | ${whole(s.queueP90)} | ${whole(s.setupP50)} | ${whole(s.workP50)} | ${whole(s.workP90)} | ${whole(s.runnerMinutes)} |`;
  return [
    `### ${repo}`,
    '',
    '| Job | Runs | Wait p50 (s) | Wait p90 (s) | Setup p50 (s) | Work p50 (s) | Work p90 (s) | Runner-min |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    row('**All jobs**', overall),
    ...jobs.map((job) => row(job.name, job)),
  ].join('\n');
}

/** Reads up to `runs` completed runs and their jobs through `api`. */
export async function audit({ api, runs }) {
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(runs / 100) }, (_, index) =>
      api(`actions/runs?status=completed&per_page=100&page=${index + 1}`),
    ),
  );
  const recent = pages.flatMap((page) => page.workflow_runs).slice(0, runs);
  const jobs = await Promise.all(
    recent.map((run) =>
      api(`actions/runs/${run.id}/attempts/${run.run_attempt ?? 1}/jobs?per_page=100`),
    ),
  );
  return jobs.flatMap((page) => page.jobs.map(splitJob)).filter(Boolean);
}

async function runCli() {
  const [repo, runs = '150'] = process.argv.slice(2);
  if (!repo) throw new Error('Usage: pnpm ci:audit owner/repo [runs]');
  const token =
    process.env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };
  const rows = await audit({ api, runs: Number(runs) });
  console.log(toMarkdown(repo, summarize(rows)));
}

// realpath and pathToFileURL keep the guard true for symlinked or spaced paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli();
}
