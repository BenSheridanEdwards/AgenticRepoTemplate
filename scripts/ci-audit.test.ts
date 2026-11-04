/**
 * @jest-environment node
 */
import {
  audit,
  createdFilter,
  inBatches,
  percentile,
  runWall,
  splitJob,
  summarize,
  toMarkdown,
} from './ci-audit.mjs';

const at = (second: number) => new Date(Date.UTC(2026, 10, 3, 9, 0, second)).toISOString();
const step = (name: string, from: number, to: number) => ({
  name,
  started_at: at(from),
  completed_at: at(to),
});

const job = {
  name: 'Tooling tests (2/3)',
  runner_name: 'GitHub Actions 1',
  conclusion: 'success',
  labels: ['ubuntu-latest'],
  created_at: at(0),
  started_at: at(5),
  completed_at: at(50),
  steps: [
    step('Set up job', 5, 7),
    step('Run actions/checkout@v7', 7, 10),
    step('Run ./.github/actions/setup', 10, 25),
    step('Run pnpm test:tooling', 25, 45),
    step('Post Run actions/checkout@v7', 45, 48),
    step('Complete job', 48, 50),
  ],
};

describe('splitJob', () => {
  it('splits a job into waiting, setup, teardown and work seconds', () => {
    expect(splitJob(job)).toEqual({
      job: 'Tooling tests (N)',
      selfHosted: false,
      queue: 5,
      setup: 20,
      teardown: 5,
      work: 20,
      total: 45,
    });
  });

  it('counts a job cancelled before any runner took it as waiting only', () => {
    const neverRan = { ...job, runner_name: null, steps: [], completed_at: at(3600) };
    expect(splitJob(neverRan)).toMatchObject({ queue: 3600, setup: 0, work: 0, total: 0 });
  });

  it('never reports a negative duration when timestamps run backwards', () => {
    const backwards = { ...job, runner_name: 'r', steps: [], completed_at: at(1) };
    expect(splitJob(backwards)).toMatchObject({ total: 0, work: 0 });
  });

  it('marks a job that ran on a self-hosted runner', () => {
    expect(splitJob({ ...job, labels: ['self-hosted', 'cua-linux'] })?.selfHosted).toBe(true);
  });

  it.each([
    ['skipped', { ...job, conclusion: 'skipped' }],
    ['never started', { ...job, started_at: null }],
  ])('ignores a job that was %s', (_label, input) => {
    expect(splitJob(input)).toBeNull();
  });
});

describe('percentile', () => {
  it('reads the value at the given fraction of the sorted values', () => {
    expect(percentile([30, 10, 20, 40], 0.5)).toBe(30);
    expect(percentile([30, 10, 20, 40], 0.9)).toBe(40);
  });

  it('reports 0 when there are no values', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('summarize and toMarkdown', () => {
  it('lists the busiest job first under the all-jobs row', () => {
    const quick = { ...job, name: 'Lint', completed_at: at(15), steps: [] };
    const rows = [job, job, quick].map(splitJob).filter((row) => row !== null);
    const summary = summarize(rows);
    expect(summary.jobs.map((entry) => entry.name)).toEqual(['Tooling tests (N)', 'Lint']);
    expect(toMarkdown('owner/repo', summary).split('\n').slice(4, 6)).toEqual([
      '| **All jobs** | 3 | 5 | 5 | 20 | 20 | 20 | 2 |',
      '| Tooling tests (N) | 2 | 5 | 5 | 20 | 20 | 20 | 2 |',
    ]);
  });
});

describe('audit', () => {
  it('reads only the requested number of runs and the jobs of each attempt', async () => {
    const paths: string[] = [];
    const api = async (path: string) => {
      paths.push(path);
      return path.startsWith('actions/runs?')
        ? {
            workflow_runs: [
              { id: 1, run_attempt: 2, name: 'CI', event: 'pull_request', created_at: at(0) },
              { id: 2 },
            ],
          }
        : { jobs: [job] };
    };
    const { rows, runs } = await audit({ api, runs: 1 });
    expect(rows).toHaveLength(1);
    expect(runs).toEqual([{ workflow: 'CI', event: 'pull_request', wall: 50 }]);
    expect(paths).toEqual([
      'actions/runs?status=completed&per_page=100&page=1',
      'actions/runs/1/attempts/2/jobs?per_page=100',
    ]);
  });
});

describe('runWall', () => {
  it('measures from run creation to the last finished job', () => {
    const run = { created_at: at(0) };
    expect(runWall(run, [job, { ...job, completed_at: at(40) }])).toBe(50);
  });

  it('reports null when every job was skipped', () => {
    expect(runWall({ created_at: at(0) }, [{ ...job, conclusion: 'skipped' }])).toBeNull();
  });
});

describe('createdFilter', () => {
  it.each([
    [{ since: 'A', until: 'B' }, '&created=A..B'],
    [{ since: 'A' }, `&created=${encodeURIComponent('>=A')}`],
    [{ until: 'B' }, `&created=${encodeURIComponent('<=B')}`],
    [{}, ''],
  ])('filters runs created in %j', (window, expected) => {
    expect(createdFilter(window)).toBe(expected);
  });
});

describe('pull request wall-clock', () => {
  it('summarizes only pull request runs per workflow and prints their table', () => {
    const runs = [
      { workflow: 'CI', event: 'pull_request', wall: 100 },
      { workflow: 'CI', event: 'pull_request', wall: 140 },
      { workflow: 'CI', event: 'workflow_dispatch', wall: 900 },
      { workflow: 'CI', event: 'pull_request', wall: null },
    ];
    const summary = summarize([], runs);
    expect(summary.workflows).toEqual([{ name: 'CI', runs: 2, wallP50: 140, wallP90: 140 }]);
    expect(toMarkdown('owner/repo', summary)).toContain('| CI | 2 | 140 | 140 |');
  });
});

describe('inBatches', () => {
  it('keeps order and runs at most `size` calls at once', async () => {
    const state = { running: 0, peak: 0 };
    const result = await inBatches([1, 2, 3, 4, 5], 2, async (n: number) => {
      state.running += 1;
      state.peak = Math.max(state.peak, state.running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.running -= 1;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(state.peak).toBe(2);
  });
});
